import type { PaypalInvoice } from "./types";

const day = (value: string) => Date.parse(value.slice(0, 10));
export const elapsedDays = (from: string, to: string) => Math.max(0, Math.floor((day(to) - day(from)) / 86400000));

/** Exact email identity where present; never fuzzy-match different payers. */
export function payerHistory(invoice: PaypalInvoice, all: PaypalInvoice[]) {
  const identity = (row: PaypalInvoice) => row.clientEmail?.trim().toLowerCase() || `name:${row.clientName.trim().toLowerCase()}`;
  const paid = all.filter((row) => row.id !== invoice.id && identity(row) === identity(invoice) && row.status === "paid" && row.paypalStatus !== "REFUNDED" && row.paidAt)
    .sort((a, b) => Date.parse(b.paidAt!) - Date.parse(a.paidAt!)).slice(0, 3);
  const lateDays = paid.map((row) => elapsedDays(row.dueDate, row.paidAt!));
  return { count: paid.length, lateCount: lateDays.filter((days) => days > 0).length,
    averageLateDays: lateDays.length ? Math.round(lateDays.reduce((total, days) => total + days, 0) / lateDays.length) : 0 };
}
