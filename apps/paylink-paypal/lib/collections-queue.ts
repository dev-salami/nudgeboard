import { balance } from "./ledger";
import type { PaypalInvoice } from "./types";

export function isOpen(invoice: PaypalInvoice) {
  return ["pending", "expired", "underpaid"].includes(invoice.status) && !invoice.paidAt && !invoice.receiptId
    && !["DRAFT", "PAID", "MARKED_AS_PAID", "CANCELLED", "REFUNDED", "PAYMENT_PENDING"].includes(invoice.paypalStatus || "");
}

// Tiny balances age out after 45 days; repeated chases escalate after 14.
export const COLLECTION_POLICY = { writeoffBalance: 25, writeoffDays: 45, escalateDays: 14, largeBalance: 1000 };

export function proposeCollectionAction(invoice: PaypalInvoice, all: PaypalInvoice[], now = new Date()) {
  void all;
  const daysOverdue = Math.max(0, Math.floor((Date.parse(now.toISOString().slice(0, 10)) - Date.parse(invoice.dueDate)) / 86400000));
  const remaining = balance(invoice);
  const writeoff = remaining <= COLLECTION_POLICY.writeoffBalance && daysOverdue >= COLLECTION_POLICY.writeoffDays;
  const escalate = daysOverdue >= COLLECTION_POLICY.escalateDays && (!!invoice.lastRemindedAt || remaining >= COLLECTION_POLICY.largeBalance);
  const action = writeoff ? "writeoff" : escalate ? "escalate" : "remind";
  const tone = escalate ? "firm" : "friendly";
  const reason = writeoff ? `No payment in ${daysOverdue} days; balance ${remaining.toFixed(2)} USD — propose write-off`
    : escalate ? `Overdue ${daysOverdue} days; balance ${remaining.toFixed(2)} USD — escalate`
    : `First reminder; due ${daysOverdue} days ago`;
  return { invoiceId: invoice.id, action, tone, reason, daysOverdue, remaining } as const;
}

export function collectionsQueue(invoices: PaypalInvoice[], now = new Date()) {
  // Rank every open invoice by days overdue descending, then remaining balance descending.
  return invoices.filter(isOpen).map((invoice) => ({ invoice, ...proposeCollectionAction(invoice, invoices, now) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.remaining - a.remaining || a.invoiceId.localeCompare(b.invoiceId));
}
