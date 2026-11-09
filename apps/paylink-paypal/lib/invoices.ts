import {
  canTransition,
  createId,
  formatLongDate,
  isoDate,
  reminderRefusal,
  type CreatePaymentInput,
  type PaymentCheckResult,
} from "@181hacks/paylink-core";
import { appOrigin, paypalMode } from "./env";
import { sendMail } from "./mail";
import { formatUsd, paypalAmount } from "./money";
import { balance, collectedAmount, modeInvoices, receivable } from "./ledger";
import { readWebhook } from "./paypal-client";
import { classifyPaypalInvoice, getPaypalRail } from "./provider";
import { assertEligible, assertUnchanged, executeConfirmed } from "./confirmations";
import { getDb, logActivity, updateDb } from "./store";
import type { ActionConfirmation, PaidVia, PaypalInvoice, PaypalReceipt } from "./types";
import { recordStatusEvidence, statusEvidence } from "./evidence";

export interface IssueInput {
  clientName: string;
  clientEmail?: string;
  description: string;
  amount: string;
  dueDate: string;
  asDraft: boolean;
  channel?: PaypalInvoice["channel"];
  origin?: string;
}

export function payPath(id: string, origin?: string): string {
  const base = (origin || appOrigin()).replace(/\/$/, "");
  return `${base}/pay/${id}`;
}

export function findInvoice(query: string, invoices = getDb().invoices): PaypalInvoice | undefined {
  const needle = query.trim().toLowerCase();
  if (!needle) return undefined;
  const exact = invoices.find((invoice) => invoice.id.toLowerCase() === needle || invoice.number.toLowerCase() === needle);
  if (exact) return exact;
  const byRef = invoices.find((invoice) => invoice.payment?.reference.toLowerCase() === needle);
  if (byRef) return byRef;
  const named = invoices.filter((invoice) => invoice.clientName.toLowerCase() === needle || invoice.clientName.toLowerCase().includes(needle));
  return named.length === 1 ? named[0] : undefined;
}

export function unpaidInvoices(): PaypalInvoice[] {
  return modeInvoices(getDb().invoices, paypalMode()).filter((invoice) => invoice.status !== "paid");
}

export async function issueInvoice(input: IssueInput): Promise<PaypalInvoice> {
  const amount = paypalAmount(input.amount);
  if (!input.clientName.trim()) throw new Error("A client name is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || new Date(`${input.dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== input.dueDate) {
    throw new Error("Use a valid due date in YYYY-MM-DD format.");
  }
  if (input.clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.clientEmail.trim())) throw new Error("Use a valid client email address.");
  const matches = getDb().invoices.filter((invoice) => invoice.clientName === input.clientName.trim()
    && invoice.clientEmail === (input.clientEmail?.trim() || undefined) && invoice.amount === amount
    && invoice.description === tidyDescription(input.description) && invoice.dueDate === input.dueDate);
  if (matches.some((invoice) => getDb().confirmations.some((row) => row.invoiceId === invoice.id && row.action === "send" && ["executing", "uncertain"].includes(row.state)))) {
    throw new Error("An identical invoice send may be in progress or uncertain. Review that invoice; do not create a replacement.");
  }
  const existingDraft = matches.find((invoice) => invoice.status === "draft");
  if (existingDraft) return existingDraft; // Retried preview cannot create another send token.
  const now = new Date();

  const created = updateDb((db) => {
    db.sequence += 1;
    const stamp = now.toISOString();
    const invoice: PaypalInvoice = {
      id: createId("inv"),
      number: `PP-${now.getUTCFullYear()}-${db.sequence}`,
      clientName: input.clientName.trim(),
      clientEmail: input.clientEmail?.trim() || undefined,
      description: tidyDescription(input.description),
      amount,
      currency: "USD",
      dueDate: input.dueDate,
      status: "draft",
      channel: input.channel ?? "agent",
      createdAt: stamp,
      updatedAt: stamp,
    };
    db.invoices.unshift(invoice);
    logActivity(db, {
      kind: "invoice_created",
      title: `Drafted ${invoice.number} for ${invoice.clientName}`,
      detail: `${formatUsd(invoice.amount)} USD · ${invoice.description}`,
      invoiceId: invoice.id,
      href: `/invoices/${invoice.id}`,
    });
    return invoice;
  });

  // Even legacy callers with asDraft:false cannot create or send remotely.
  // Only sendExisting with a persisted explicit confirmation may dispatch.
  return created;
}

export async function sendExisting(id: string, origin = appOrigin(), confirmationId?: string): Promise<PaypalInvoice> {
  return executeConfirmed(confirmationId, id, "send", origin, async (record) => {
    const invoice = must(getDb().invoices, id);
    if (invoice.payment?.network === "paypal-sandbox") {
      await syncInvoice(id);
      if (invoice.paymentIssue === "rpc_down") throw new Error("PayPal status could not be verified.");
    }
    assertUnchanged(record, invoice);
    return dispatchExisting(id, origin, record);
  });
}

async function dispatchExisting(id: string, origin: string, record: ActionConfirmation): Promise<PaypalInvoice> {
  const current = findInvoice(id);
  if (!current) throw new Error("That invoice is gone.");
  if (current.status !== "draft") throw new Error(`${current.number} is already ${current.status}.`);
  if (paypalMode() === "sandbox" && !current.clientEmail) {
    throw new Error("Add an email address before sending this through PayPal.");
  }
  const rail = getPaypalRail();
  if (!current.payment?.reference) {
    return issueReplacement(current, origin, record);
  }
  const sent = await rail.deliver(current.payment.reference, record.preview.message);
  return updateDb((db) => {
    const invoice = must(db.invoices, current.id);
    if (invoice.status !== "draft") throw new Error("Invoice state changed during send; review PayPal.");
    invoice.status = "pending";
    invoice.paypalStatus = "SENT";
    if (invoice.payment) {
      invoice.payment.status = invoice.paypalStatus;
      invoice.payment.hostedUrl = sent.recipientViewUrl || invoice.payment.hostedUrl;
      invoice.payment.url = payPath(invoice.id, origin);
    }
    invoice.updatedAt = new Date().toISOString();
    logActivity(db, {
      kind: "invoice_issued",
      title: `Sent ${invoice.number} to ${invoice.clientName}`,
      detail: invoice.payment?.reference,
      invoiceId: invoice.id,
      href: `/pay/${invoice.id}`,
    });
    return invoice;
  });
}

async function issueReplacement(current: PaypalInvoice, origin: string, record: ActionConfirmation): Promise<PaypalInvoice> {
  const merchant = getDb().merchant;
  const rail = getPaypalRail();
  const request = await rail.createRequest({
    invoiceId: current.id,
    amount: current.amount,
    currency: "USDC",
    label: current.number,
    message: current.description,
    memo: current.dueDate,
    invoiceNumber: current.number,
    clientName: current.clientName,
    clientEmail: current.clientEmail,
    description: current.description,
    dueDate: current.dueDate,
    invoiceDate: isoDate(new Date()),
    merchantName: merchant.name,
    merchantEmail: merchant.email || "merchant@example.com",
    payUrl: payPath(current.id, origin),
  } as CreatePaymentInput);
  updateDb(() => { record.remoteReference = request.reference; });
  // Re-check after the awaited remote creation, before sending. A failure leaves
  // the durable reservation blocked; never silently create a replacement.
  assertUnchanged(record, current);
  // Persist a remotely created draft before sending, including on interruption.
  updateDb(() => {
    current.payment = { provider: "paypal", reference: request.reference, url: payPath(current.id, origin), recipient: request.recipient, asset: "USD",
      network: request.network === "paypal-sandbox" ? "paypal-sandbox" : "paypal-demo", status: "DRAFT" };
  });
  assertEligible(current, "send");
  const sent = await rail.deliver(request.reference, record.preview.message);
  return updateDb((db) => {
    const invoice = must(db.invoices, current.id);
    if (invoice.status !== "draft") throw new Error("Invoice state changed during send; review PayPal.");
    invoice.status = "pending";
    invoice.paypalStatus = "SENT";
    invoice.payment = {
      provider: "paypal",
      reference: request.reference,
      url: payPath(invoice.id, origin),
      hostedUrl: sent.recipientViewUrl,
      recipient: request.recipient,
      asset: "USD",
      network: request.network === "paypal-sandbox" ? "paypal-sandbox" : "paypal-demo",
      status: invoice.paypalStatus,
    };
    invoice.updatedAt = new Date().toISOString();
    logActivity(db, { kind: "invoice_issued", title: `Sent ${invoice.number} to ${invoice.clientName}`, detail: request.reference, invoiceId: invoice.id, href: `/pay/${invoice.id}` });
    return invoice;
  });
}

export async function remindInvoice(query: string, origin = appOrigin(), confirmationId?: string): Promise<{ invoice: PaypalInvoice; refusal?: string }> {
  const invoice = findInvoice(query);
  if (!invoice) throw new Error("Choose a unique invoice number before preparing a reminder.");
  const refusal = reminderRefusal(invoice);
  if (refusal) return { invoice, refusal };
  return executeConfirmed(confirmationId, invoice.id, "remind", origin, async (record) => {
    if (invoice.payment?.network === "paypal-sandbox") await syncInvoice(invoice.id);
    if (invoice.paymentIssue === "rpc_down") throw new Error("PayPal status could not be verified.");
    assertUnchanged(record, invoice);
    return dispatchReminder(invoice.id, origin, record.preview.message);
  });
}

async function dispatchReminder(query: string, origin: string, note: string): Promise<{ invoice: PaypalInvoice; refusal?: string }> {
  const invoice = findInvoice(query);
  if (!invoice) throw new Error(query ? `I couldn't find “${query}”.` : "Which invoice should I chase?");
  assertEligible(invoice, "remind");
  const refusal = reminderRefusal(invoice);
  if (refusal) return { invoice, refusal };
  if (["CANCELLED", "REFUNDED"].includes(invoice.paypalStatus || "")) return { invoice, refusal: "This PayPal invoice was cancelled or refunded. No reminder was sent." };

  const link = payPath(invoice.id, origin);
  if (invoice.payment?.reference) {
    try {
      await getPaypalRail().chase(invoice.payment.reference, note);
    } catch (error) {
      const message = error instanceof Error ? error.message : "PayPal could not send the reminder.";
      if (invoice.payment.network === "paypal-sandbox") throw new Error(message);
    }
  }

  // Sandbox uses PayPal's single reminder channel; do not also send SMTP mail.
  if (invoice.clientEmail && invoice.payment?.network !== "paypal-sandbox") {
    await sendMail({
      to: invoice.clientEmail,
      subject: `Reminder: ${invoice.number} is still open`,
      text: note,
      html: `<p>${escapeHtml(note)}</p><p><a href="${link}">Pay ${formatUsd(invoice.amount)} USD</a></p>`,
      invoiceId: invoice.id,
    });
    updateDb((db) => {
      logActivity(db, {
        kind: "email_sent",
        title: `Reminded ${invoice.clientName}`,
        detail: `${invoice.number} · due ${formatLongDate(invoice.dueDate)}`,
        invoiceId: invoice.id,
        href: `/invoices/${invoice.id}`,
      });
    });
  } else if (invoice.payment?.network === "paypal-sandbox") {
    updateDb((db) => { logActivity(db, { kind: "note", title: `PayPal sandbox reminder accepted for ${invoice.number}`, detail: "PayPal delivery only; no additional email sent.", invoiceId: invoice.id }); });
  } else {
    updateDb((db) => {
      logActivity(db, {
        kind: "note",
        title: `Reminder drafted for ${invoice.number}`,
        detail: "No client email is on the invoice, so nothing was sent.",
        invoiceId: invoice.id,
      });
    });
  }
  updateDb(() => { invoice.lastRemindedAt = new Date().toISOString(); });
  return { invoice };
}

export async function writeoffInvoice(id: string, origin = appOrigin(), confirmationId?: string) {
  return executeConfirmed(confirmationId, id, "writeoff", origin, async (record) => {
    const invoice = must(getDb().invoices, id);
    if (invoice.payment?.network === "paypal-sandbox") await syncInvoice(id);
    if (invoice.paymentIssue === "rpc_down") throw new Error("PayPal status could not be verified.");
    assertUnchanged(record, invoice);
    await getPaypalRail().client.cancel(invoice.payment!.reference, record.preview.message);
    return updateDb((db) => {
      invoice.paypalStatus = "CANCELLED";
      invoice.payment!.status = "CANCELLED";
      invoice.status = "expired";
      recordStatusEvidence(invoice, "confirmed-action");
      invoice.updatedAt = new Date().toISOString();
      logActivity(db, { kind: "status_changed", title: `${invoice.number} cancelled in PayPal`, detail: record.preview.message, invoiceId: id });
      return invoice;
    });
  });
}

export async function recordInvoiceMoney(id: string, action: "record-payment" | "record-refund", origin = appOrigin(), confirmationId?: string) {
  return executeConfirmed(confirmationId, id, action, origin, async (record) => {
    const invoice = must(getDb().invoices, id);
    if (invoice.payment?.network === "paypal-sandbox") await syncInvoice(id);
    if (invoice.paymentIssue === "rpc_down") throw new Error("PayPal status could not be verified.");
    assertUnchanged(record, invoice);
    if (!record.moneyInput) throw new Error("Money preview input missing.");
    const client = getPaypalRail().client;
    const result = action === "record-payment" ? await client.recordPayment(invoice.payment!.reference, record.moneyInput) : await client.recordRefund(invoice.payment!.reference, record.moneyInput);
    updateDb((db) => {
      invoice.paypalStatus = result.invoice.status;
      if (invoice.payment) invoice.payment.status = result.invoice.status;
      if (action === "record-payment") {
        invoice.recordedPaymentId = result.reference;
        invoice.lastPaymentAt = record.moneyInput!.date;
      } else {
        invoice.recordedRefundId = result.reference;
        invoice.amountRefunded = result.invoice.amountRefunded;
      }
      invoice.updatedAt = new Date().toISOString();
      logActivity(db, { kind: "status_changed", title: `${invoice.number}: ${action}`, detail: `PayPal ${result.reference} · ${record.preview.message}`, invoiceId: id });
    });
    invoice.statusSource = "confirmed-action";
    if (action === "record-payment") applyCheck(id, classifyPaypalInvoice({ ...result.invoice, transactionId: result.invoice.transactionId || result.reference }, invoice.amount, invoice.dueDate, new Date()));
    updateDb(() => recordStatusEvidence(invoice, "confirmed-action"));
    return invoice;
  });
}

export async function chaseUnpaid(origin = appOrigin()): Promise<{ reminded: PaypalInvoice[]; skipped: string[] }> {
  void origin;
  throw new Error("Bulk sends are disabled. Preview and confirm one exact invoice at a time.");
}

export async function syncInvoice(id: string): Promise<PaypalInvoice> {
  const current = findInvoice(id);
  if (!current) throw new Error("That invoice is gone.");
  if (!current.payment?.reference) return current;
  if (current.payment.network === "paypal-demo" && paypalMode() !== "demo") return current;
  if (current.payment.network === "paypal-sandbox" && paypalMode() !== "sandbox") return current;
  try {
    const remote = await getPaypalRail().lookup(current.payment.reference);
    const previous = JSON.stringify([current.status, current.paypalStatus, current.amountReceived, current.amountRefunded]);
    updateDb((db) => {
      const invoice = must(db.invoices, id);
      invoice.paypalStatus = remote.status;
      invoice.statusSource = "paypal-get";
      if (remote.amountRefunded !== undefined) invoice.amountRefunded = remote.amountRefunded;
      if (remote.refundId) invoice.recordedRefundId = remote.refundId;
      if (invoice.status === "draft" && remote.status !== "DRAFT") invoice.status = "pending";
      if (invoice.payment) {
        invoice.payment.status = remote.status;
        invoice.payment.hostedUrl = remote.recipientViewUrl || invoice.payment.hostedUrl;
      }
    });
    // A draft cannot become overdue merely because its proposed due date passed.
    if (current.status === "draft" && remote.status === "DRAFT") return current;
    const result = applyCheck(current.id, classifyPaypalInvoice(remote, current.amount, current.dueDate, new Date()));
    if (previous !== JSON.stringify([result.status, result.paypalStatus, result.amountReceived, result.amountRefunded])) updateDb((db) => {
      recordStatusEvidence(result, "paypal-get");
      logActivity(db, { kind: "status_changed", title: `${result.number}: ${result.paypalStatus}`, detail: statusEvidence(result), invoiceId: id });
    });
    return result;
  } catch (error) {
    return applyCheck(current.id, { status: "pending", issue: "rpc_down", message: error instanceof Error ? error.message : "PayPal could not be reached." });
  }
}

const pollTimes = new Map<string, number>();
/** Dashboard reads are rate-limited; oldest checks first to avoid starving rows. */
export async function pollSandboxInvoices(): Promise<void> {
  if (paypalMode() !== "sandbox") return;
  const rows = getDb().invoices.filter((row) => row.payment?.network === "paypal-sandbox" && row.status !== "paid")
    .sort((a, b) => (pollTimes.get(a.id) ?? 0) - (pollTimes.get(b.id) ?? 0));
  await Promise.all(rows.filter((row) => Date.now() - (pollTimes.get(row.id) ?? 0) >= 15_000).slice(0, 5).map(async (row) => {
    pollTimes.set(row.id, Date.now());
    await syncInvoice(row.id);
  }));
}

export function completeDemoPayment(id: string, via: PaidVia = "paypal"): PaypalInvoice {
  const current = findInvoice(id);
  if (!current) throw new Error("That invoice is gone.");
  if (current.status === "draft") throw new Error("This invoice has not been sent.");
  if (paypalMode() !== "demo" || current.payment?.network === "paypal-sandbox") {
    throw new Error("This invoice is on PayPal sandbox. Pay there, then sync.");
  }
  if (current.status === "paid") return current;
  const transactionId = `DEMO-${via === "card" ? "CARD" : "PAYPAL"}-${current.id.slice(-8).toUpperCase()}`;
  const reference = current.payment?.reference;
  if (reference) {
    try {
      getPaypalRail().client.simulatePayment?.(reference, transactionId, current.amount);
    } catch {
      // Seeded rows live in the store and are not in the in-memory PayPal map.
    }
  }
  return updateDb((db) => markPaid(db, current.id, { transactionId, amount: current.amount, via }));
}

/** Caller verifies the PayPal signature before this runs. */
export function applyWebhook(event: unknown): { ok: boolean; duplicate?: boolean; invoiceId?: string; message: string } {
  const parsed = readWebhook(event);
  if (!parsed) return { ok: false, message: "Not an invoicing event." };
  if (parsed.id && getDb().webhookIds.includes(parsed.id)) {
    return { ok: true, duplicate: true, message: "Already applied.", invoiceId: findInvoice(parsed.invoiceId)?.id };
  }
  const invoice = findInvoice(parsed.invoiceId) ?? getDb().invoices.find((item) => item.payment?.reference === parsed.invoiceId);
  if (!invoice) return { ok: false, message: `No local invoice for ${parsed.invoiceId}.` };
  if (invoice.payment?.network !== `paypal-${paypalMode()}`) return { ok: false, message: "Invoice mode differs from webhook mode." };

  if (!parsed.id) return { ok: false, message: "An invoicing event id is required." };
  const type = parsed.eventType.toUpperCase();
  const status = parsed.status || (type.endsWith(".CANCELLED") ? "CANCELLED" : type.endsWith(".REFUNDED") ? "REFUNDED" : type.endsWith(".PAID") ? "PAID" : invoice.paypalStatus || "SENT");
  updateDb(() => {
    invoice.lastPaypalEventId = parsed.id;
    invoice.statusSource = "webhook";
    invoice.paypalStatus = status;
    if (invoice.payment) invoice.payment.status = status;
    if (parsed.amountRefunded) invoice.amountRefunded = parsed.amountRefunded;
  });
  // Partial payment events carry cumulative paid_amount; never infer full payment from the event name.
  if (!(invoice.status === "draft" && status === "DRAFT")) applyCheck(invoice.id, classifyPaypalInvoice({ id: parsed.invoiceId, status, transactionId: parsed.transactionId, amountPaid: parsed.amount }, invoice.amount, invoice.dueDate, new Date()));
  updateDb((db) => {
    recordStatusEvidence(invoice, "webhook", parsed.id);
    db.webhookIds.push(parsed.id!);
    logActivity(db, { kind: "status_changed", title: `${invoice.number}: ${status}`, detail: statusEvidence(invoice), invoiceId: invoice.id });
  });
  return { ok: true, invoiceId: invoice.id, message: `${invoice.number} is ${invoice.paypalStatus}.` };
}

export function totals() {
  const invoices = modeInvoices(getDb().invoices, paypalMode()).filter((invoice) => !invoice.sample);
  return {
    outstanding: invoices.filter((invoice) => receivable(invoice) && invoice.status !== "expired").reduce((total, invoice) => total + balance(invoice), 0),
    collected: invoices.reduce((total, invoice) => total + collectedAmount(invoice), 0),
    overdue: invoices.filter((invoice) => receivable(invoice) && invoice.status === "expired").reduce((total, invoice) => total + balance(invoice), 0),
    drafts: invoices.filter((invoice) => invoice.status === "draft").length,
  };
}

function applyCheck(id: string, result: PaymentCheckResult): PaypalInvoice {
  return updateDb((db) => {
    const invoice = must(db.invoices, id);
    if (!result.issue) {
      invoice.paymentIssue = null;
      invoice.paymentIssueDetail = undefined;
    }
    if (result.status === "paid") {
      if (!result.signature || !result.amountReceived) {
        invoice.paymentIssue = "rpc_down";
        invoice.paymentIssueDetail = "Payment evidence is incomplete. Sync again; no receipt issued.";
        return invoice;
      }
      return markPaid(db, id, { transactionId: result.signature, amount: result.amountReceived, via: invoice.paidVia ?? "paypal" });
    }
    if (result.status === "underpaid" && canTransition(invoice.status, "underpaid")) {
      invoice.status = "underpaid";
      invoice.amountReceived = result.amountReceived;
      invoice.paymentIssue = "underpaid";
      invoice.paymentIssueDetail = result.message;
    } else if (result.status === "expired" && canTransition(invoice.status, "expired")) {
      invoice.status = "expired";
      invoice.paymentIssueDetail = result.message;
    } else if (result.issue === "rpc_down") {
      invoice.paymentIssue = "rpc_down";
      invoice.paymentIssueDetail = result.message;
    }
    invoice.updatedAt = new Date().toISOString();
    return invoice;
  });
}

function markPaid(db: ReturnType<typeof getDb>, id: string, info: { transactionId?: string; amount: string; via: PaidVia }): PaypalInvoice {
  const invoice = must(db.invoices, id);
  if (!info.transactionId?.trim()) throw new Error("Verified payment transaction evidence is required before issuing a receipt.");
  if (invoice.status === "paid") return invoice;
  if (!canTransition(invoice.status, "paid")) return invoice;
  const paidAt = new Date().toISOString();
  invoice.status = "paid";
  invoice.paidAt = paidAt;
  invoice.paidVia = info.via;
  invoice.amountReceived = paypalAmount(info.amount);
  invoice.txSignature = info.transactionId;
  invoice.paypalStatus = "PAID";
  invoice.paymentIssue = null;
  invoice.paymentIssueDetail = undefined;
  if (invoice.payment) invoice.payment.status = "PAID";
  const receipt: PaypalReceipt = {
    lastPaypalEventId: invoice.statusSource === "webhook" ? invoice.lastPaypalEventId : undefined,
    id: createId("rcp"),
    invoiceId: invoice.id,
    number: invoice.number,
    clientName: invoice.clientName,
    clientEmail: invoice.clientEmail,
    description: invoice.description,
    amount: invoice.amountReceived,
    currency: "USD",
    paidAt,
    paypalInvoiceId: invoice.payment?.reference,
    transactionId: info.transactionId,
    paidVia: info.via,
    merchantName: db.merchant.name,
    sample: invoice.sample,
  };
  invoice.receiptId = receipt.id;
  invoice.updatedAt = paidAt;
  db.receipts.unshift(receipt);
  logActivity(db, {
    kind: "status_changed",
    title: `${invoice.clientName} paid ${invoice.number}`,
    detail: `${formatUsd(invoice.amount)} USD · ${info.via === "card" ? "card via PayPal" : "PayPal"} · ${statusEvidence(invoice)}`,
    invoiceId: invoice.id,
    href: `/receipts/${receipt.id}`,
    txSignature: info.transactionId,
  });
  logActivity(db, {
    kind: "receipt_issued",
    title: `Receipt for ${invoice.number}`,
    detail: statusEvidence(invoice),
    invoiceId: invoice.id,
    href: `/receipts/${receipt.id}`,
  });
  return invoice;
}

function must(invoices: PaypalInvoice[], id: string): PaypalInvoice {
  const invoice = invoices.find((item) => item.id === id);
  if (!invoice) throw new Error("That invoice is gone.");
  return invoice;
}

function tidyDescription(value: string): string {
  const cleaned = value.trim().replace(/^the\s+/i, "").replace(/\s+/g, " ");
  if (!cleaned) return "Services";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}
