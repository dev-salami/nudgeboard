import type { PaypalInvoice } from "./types";

/** Keep historical demo data out of sandbox views without deleting the store. */
export function modeInvoices(rows: PaypalInvoice[], mode: "demo" | "sandbox") {
  return rows.filter((row) => mode !== "sandbox" || (!row.sample && (!row.payment || row.payment.network === "paypal-sandbox")));
}

export function receivable(invoice: PaypalInvoice) {
  return !invoice.sample && !["CANCELLED", "REFUNDED"].includes(invoice.paypalStatus || "")
    && ["pending", "expired", "underpaid"].includes(invoice.status);
}

export function balance(invoice: PaypalInvoice) {
  return Math.max(0, Math.round(Number(invoice.amount) * 100) - Math.round(Number(invoice.amountReceived || "0") * 100)) / 100;
}
