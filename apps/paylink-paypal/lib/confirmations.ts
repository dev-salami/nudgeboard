import { createId } from "@181hacks/paylink-core";
import { appOrigin, paypalEnvironment, paypalMode } from "./env";
import { formatUsd } from "./money";
import { getDb, updateDb } from "./store";
import type { ActionConfirmation, PaypalInvoice } from "./types";

// No provider/model/mail imports: preparing a preview is strictly local.
export function actionSnapshot(invoice: PaypalInvoice): string {
  return JSON.stringify([invoice.id, invoice.number, invoice.clientName, invoice.clientEmail,
    invoice.amount, invoice.currency, invoice.description, invoice.dueDate, invoice.status,
    invoice.payment?.reference, invoice.payment?.network, invoice.payment?.status, invoice.paypalStatus,
    invoice.amountReceived, invoice.paidAt, invoice.receiptId,
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
  if (action === "remind" && !["pending", "expired", "underpaid"].includes(invoice.status)) throw new Error("No reminder: invoice is already paid or still a draft.");
  if (["PAID", "MARKED_AS_PAID", "CANCELLED", "REFUNDED", "PAYMENT_PENDING"].includes(invoice.paypalStatus || "")) throw new Error("No send: PayPal payment state is not eligible.");
  if (action === "remind" && (!invoice.payment?.reference || invoice.payment.status === "DRAFT")) throw new Error("No reminder: this invoice has not been sent.");
  if (paypalMode() === "sandbox" && !invoice.clientEmail) throw new Error("Add a client email before preparing a send.");
}

export function prepareConfirmation(invoiceId: string, action: ActionConfirmation["action"], origin = appOrigin()): ActionConfirmation {
  const invoice = getDb().invoices.find((row) => row.id === invoiceId);
  if (!invoice) throw new Error("Choose an exact invoice.");
  assertEligible(invoice, action);
  const snapshot = actionSnapshot(invoice);
  return updateDb((db) => {
    const blocked = db.confirmations.find((row) => row.invoiceId === invoiceId && ["executing", "uncertain"].includes(row.state));
    if (blocked) throw new Error("An earlier action may have reached PayPal. Operator review is required; do not retry.");
    const existing = db.confirmations.find((row) => row.invoiceId === invoiceId && row.action === action && row.mode === paypalMode() && row.snapshot === snapshot && row.origin === origin && row.state === "pending" && Date.parse(row.expiresAt) > Date.now());
    if (existing) return existing;
    // Only one pending preview per invoice. Changed/replaced previews cannot execute.
    for (const row of db.confirmations) if (row.invoiceId === invoiceId && row.state === "pending") row.state = "stale";
    const message = action === "send" ? `Invoice ${invoice.number} for ${invoice.description}.`
      : `${invoice.clientName}, ${invoice.number} for ${formatUsd(invoice.amount)} USD (${invoice.description}) is still open. Pay here: ${origin.replace(/\/$/, "")}/pay/${invoice.id}`;
    const record: ActionConfirmation = { id: createId("confirm"), invoiceId, action, mode: paypalMode(), snapshot, origin,
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
