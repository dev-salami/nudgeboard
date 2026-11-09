import type { PaypalInvoice } from "./types";

/** Keep historical demo data out of sandbox views without deleting the store. */
export function modeInvoices(rows: PaypalInvoice[], mode: "demo" | "sandbox") {
  return rows.filter((row) => mode !== "sandbox" || (!row.sample && (!row.payment || row.payment.network === "paypal-sandbox")));
}

export function receivable(invoice: PaypalInvoice) {
  return !invoice.sample && !["CANCELLED", "REFUNDED", "MARKED_AS_REFUNDED", "PARTIALLY_REFUNDED"].includes(invoice.paypalStatus || "")
    && ["pending", "expired", "underpaid"].includes(invoice.status);
}

export function balance(invoice: PaypalInvoice) {
  return Math.max(0, Math.round(Number(invoice.amount) * 100) - Math.round(Number(invoice.amountReceived || "0") * 100)) / 100;
}

export function collectedAmount(invoice: PaypalInvoice) {
  if (["REFUNDED", "MARKED_AS_REFUNDED"].includes(invoice.paypalStatus || "")) return 0;
  return Math.max(0, Number(invoice.amountReceived || (invoice.status === "paid" ? invoice.amount : 0)) - Number(invoice.amountRefunded || 0));
}
