import { balance } from "./ledger";
import type { PaypalInvoice } from "./types";
import { elapsedDays, payerHistory } from "./payer-history";

export function isOpen(invoice: PaypalInvoice) {
  return ["pending", "expired", "underpaid"].includes(invoice.status) && !invoice.paidAt && !invoice.receiptId
    && !["DRAFT", "PAID", "MARKED_AS_PAID", "CANCELLED", "REFUNDED", "PAYMENT_PENDING"].includes(invoice.paypalStatus || "");
}

// Write off <= $25 only after 45 overdue days AND 45 days without movement.
// Escalate after 14 overdue days if reminded, large, or repeatedly late (3/3).
export const COLLECTION_POLICY = { writeoffBalance: 25, writeoffDays: 45, escalateDays: 14, largeBalance: 1000 };

export function proposeCollectionAction(invoice: PaypalInvoice, all: PaypalInvoice[], now = new Date()) {
  const daysOverdue = elapsedDays(invoice.dueDate, now.toISOString());
  const remaining = balance(invoice);
  const history = payerHistory(invoice, all);
  const noMovementDays = invoice.lastPaymentAt ? elapsedDays(invoice.lastPaymentAt, now.toISOString()) : daysOverdue;
  const writeoff = remaining > 0 && remaining <= COLLECTION_POLICY.writeoffBalance && daysOverdue >= COLLECTION_POLICY.writeoffDays && noMovementDays >= COLLECTION_POLICY.writeoffDays;
  const escalate = daysOverdue >= COLLECTION_POLICY.escalateDays && (!!invoice.lastRemindedAt || remaining >= COLLECTION_POLICY.largeBalance || history.lateCount === 3);
  const action = writeoff ? "writeoff" : escalate ? "escalate" : "remind";
  const tone = escalate || invoice.lastRemindedAt || history.lateCount >= 2 ? "firm" : Number(invoice.amountReceived || 0) > 0 ? "empathetic" : "friendly";
  const reason = writeoff ? `No payment in ${noMovementDays} days; balance ${remaining.toFixed(2)} USD — propose write-off`
    : Number(invoice.amountReceived || 0) > 0 ? `Partial payment of ${Number(invoice.amountReceived).toFixed(2)} USD received; ${remaining.toFixed(2)} USD remains`
    : invoice.lastRemindedAt ? `Already reminded; still unpaid after ${daysOverdue} days`
    : history.lateCount > 0 ? `Paid ${history.averageLateDays} days late the last ${history.count} times`
    : escalate ? `Overdue ${daysOverdue} days; balance ${remaining.toFixed(2)} USD — escalate`
    : invoice.dueDate > now.toISOString().slice(0, 10) ? `First reminder; due in ${elapsedDays(now.toISOString(), invoice.dueDate)} days`
    : `First reminder; due ${daysOverdue} days ago`;
  return { invoiceId: invoice.id, action, tone, reason, daysOverdue, remaining } as const;
}

export function collectionsQueue(invoices: PaypalInvoice[], now = new Date()) {
  // Rank every open invoice by days overdue descending, then remaining balance descending.
  return invoices.filter(isOpen).map((invoice) => ({ invoice, ...proposeCollectionAction(invoice, invoices, now) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.remaining - a.remaining || a.invoiceId.localeCompare(b.invoiceId));
}
