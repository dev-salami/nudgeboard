import { createId } from "@181hacks/paylink-core";
import { appOrigin, paypalEnvironment, paypalMode } from "./env";
import type { ReminderTone } from "./ai";
import { getDb, updateDb } from "./store";
import type { ActionConfirmation, PaypalInvoice } from "./types";

// Send previews stay synchronous and local. Only the async reminder helper loads AI.
export function actionSnapshot(invoice: PaypalInvoice): string {
  return JSON.stringify([invoice.id, invoice.number, invoice.clientName, invoice.clientEmail,
    invoice.amount, invoice.currency, invoice.description, invoice.dueDate, invoice.status,
    invoice.payment?.reference, invoice.payment?.network, invoice.payment?.status, invoice.paypalStatus,
    invoice.amountReceived, invoice.paidAt, invoice.receiptId, invoice.lastRemindedAt,
    getDb().merchant]);
}

export function assertEligible(invoice: PaypalInvoice, action: ActionConfirmation["action"]) {
  if (paypalMode() === "sandbox") paypalEnvironment();
  if (invoice.paidAt || invoice.receiptId) throw new Error("No send: this invoice has payment evidence or a receipt.");
  if (invoice.payment && invoice.payment.network !== `paypal-${paypalMode()}`) throw new Error("Invoice mode differs from the current PayPal mode.");
  if (action === "send" && invoice.status !== "draft") throw new Error("Only a draft can be sent.");
  if (action === "send" && invoice.payment?.network === "paypal-sandbox"
    && !getDb().confirmations.some((row) => row.invoiceId === invoice.id && row.action === "send" && row.state === "executing" && row.remoteReference === invoice.payment?.reference)) {
    throw new Error("Legacy remote draft contents cannot be verified against this preview. Operator reconciliation is required; this workflow sends confirmed local drafts only.");
  }
  if ((action === "remind" || action === "writeoff") && !["pending", "expired", "underpaid"].includes(invoice.status)) throw new Error("No reminder: invoice is already paid or still a draft.");
  if (["PAID", "MARKED_AS_PAID", "CANCELLED", "REFUNDED", "PAYMENT_PENDING"].includes(invoice.paypalStatus || "")) throw new Error("No send: PayPal payment state is not eligible.");
  if ((action === "remind" || action === "writeoff") && (!invoice.payment?.reference || invoice.payment.status === "DRAFT" || invoice.paypalStatus === "DRAFT")) throw new Error("No reminder: this invoice has not been sent.");
  if (paypalMode() === "sandbox" && !invoice.clientEmail) throw new Error("Add a client email before preparing a send.");
}

export function prepareConfirmation(invoiceId: string, action: "send", origin = appOrigin()): ActionConfirmation {
  const invoice = getDb().invoices.find((row) => row.id === invoiceId);
  if (!invoice) throw new Error("Choose an exact invoice.");
  assertEligible(invoice, action);
  return saveConfirmation(invoice, action, origin, `Invoice ${invoice.number} for ${invoice.description}.`);
}

export async function prepareReminderConfirmation(invoiceId: string, origin = appOrigin(), tone: ReminderTone = "friendly"): Promise<ActionConfirmation> {
  const invoice = getDb().invoices.find((row) => row.id === invoiceId);
  if (!invoice) throw new Error("Choose an exact invoice.");
  assertEligible(invoice, "remind"); // Refuse before loading/calling AI.
  assertNotBlocked(invoiceId);
  const snapshot = actionSnapshot(invoice);
  const existing = pendingConfirmation(invoiceId, "remind", origin, snapshot, tone);
  if (existing) return existing;
  const { draftReminder } = await import("./ai");
  const message = await draftReminder(invoice, tone, `${origin.replace(/\/$/, "")}/pay/${invoice.id}`);
  const current = getDb().invoices.find((row) => row.id === invoiceId);
  if (!current || actionSnapshot(current) !== snapshot) throw new Error("The invoice or payment state changed. Prepare and review a fresh preview.");
  assertEligible(current, "remind");
  return saveConfirmation(current, "remind", origin, message, tone);
}

function assertNotBlocked(invoiceId: string) {
  if (getDb().confirmations.some((row) => row.invoiceId === invoiceId && ["executing", "uncertain"].includes(row.state))) {
    throw new Error("An earlier action may have reached PayPal. Operator review is required; do not retry.");
  }
}

export function prepareWriteoffConfirmation(invoiceId: string, origin = appOrigin()) {
  const invoice = getDb().invoices.find((row) => row.id === invoiceId);
  if (!invoice) throw new Error("Choose an exact invoice.");
  assertEligible(invoice, "writeoff");
  return saveConfirmation(invoice, "writeoff", origin, `Write off ${invoice.number}: cancel the remaining balance in PayPal.`);
}

function pendingConfirmation(invoiceId: string, action: ActionConfirmation["action"], origin: string, snapshot: string, tone?: ReminderTone) {
  return getDb().confirmations.find((row) => row.invoiceId === invoiceId && row.action === action && row.mode === paypalMode() && row.snapshot === snapshot && row.origin === origin && row.tone === tone && row.state === "pending" && Date.parse(row.expiresAt) > Date.now());
}

function saveConfirmation(invoice: PaypalInvoice, action: ActionConfirmation["action"], origin: string, message: string, tone?: ReminderTone): ActionConfirmation {
  const invoiceId = invoice.id;
  const snapshot = actionSnapshot(invoice);
  return updateDb((db) => {
    assertNotBlocked(invoiceId);
    const existing = pendingConfirmation(invoiceId, action, origin, snapshot, tone);
    if (existing) return existing;
    // Only one pending preview per invoice. Changed/replaced previews cannot execute.
    for (const row of db.confirmations) if (row.invoiceId === invoiceId && row.state === "pending") row.state = "stale";
    const record: ActionConfirmation = { id: createId("confirm"), invoiceId, action, tone, mode: paypalMode(), snapshot, origin,
      createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), state: "pending",
      preview: { number: invoice.number, clientName: invoice.clientName, clientEmail: invoice.clientEmail, amount: invoice.amount, currency: "USD", description: invoice.description, dueDate: invoice.dueDate, message } };
    db.confirmations.push(record);
    return record;
  });
}

export function assertUnchanged(record: ActionConfirmation, invoice: PaypalInvoice) {
  assertEligible(invoice, record.action);
  if (record.mode !== paypalMode() || actionSnapshot(invoice) !== record.snapshot) throw new Error("The invoice or payment state changed. Prepare and review a fresh preview.");
}

/** Synchronous durable reservation before the first await. No automatic replay. */
export async function executeConfirmed<T>(id: string | undefined, invoiceId: string, action: ActionConfirmation["action"], origin: string, dispatch: (record: ActionConfirmation) => Promise<T>): Promise<T> {
  if (!id) throw new Error("Review a preview and explicitly confirm this action first.");
  const record = getDb().confirmations.find((row) => row.id === id && row.invoiceId === invoiceId && row.action === action && row.origin === origin);
  if (!record) throw new Error("Confirmation does not match this action and invoice.");
  if (record.state !== "pending") throw new Error(`Confirmation is ${record.state}; it will not be sent again.`);
  const invoice = getDb().invoices.find((row) => row.id === invoiceId);
  try {
    if (!invoice || !Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= Date.now()) throw new Error("Preview expired. Prepare a fresh preview.");
    assertUnchanged(record, invoice);
  } catch (error) {
    updateDb(() => { record.state = "stale"; });
    throw error;
  }
  updateDb(() => { record.state = "executing"; });
  try {
    const result = await dispatch(record);
    updateDb(() => { record.state = "done"; });
    return result;
  } catch {
    updateDb(() => { record.state = "uncertain"; });
    throw new Error("Action not confirmed complete. It may have reached PayPal; automatic retry is blocked. Check PayPal and the local invoice before operator recovery.");
  }
}

export function cancelConfirmation(id: string) {
  return updateDb((db) => {
    const record = db.confirmations.find((row) => row.id === id);
    if (!record || record.state !== "pending") throw new Error("Only a pending preview can be cancelled.");
    record.state = "cancelled";
    return record;
  });
}
