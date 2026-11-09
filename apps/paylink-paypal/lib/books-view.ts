import { modeInvoices } from "./ledger";
import { getJudgeDemoDb } from "./store";
import type { PaypalInvoice } from "./types";

export function booksView(invoices: PaypalInvoice[], mode: "sandbox" | "demo", requested?: string) {
  const real = modeInvoices(invoices, mode).filter((row) => !row.sample);
  const demo = requested === "demo" || (requested !== "sandbox" && real.length === 0);
  return { demo, rows: demo ? getJudgeDemoDb().invoices : real };
}

export function collectionDays(invoices: PaypalInvoice[], now = new Date()) {
  const today = Date.parse(now.toISOString().slice(0, 10));
  return Array.from({ length: 24 }, (_, i) => {
    const start = today - (23 - i) * 86400000;
    return invoices.filter((row) => row.status === "paid" && row.paypalStatus !== "REFUNDED" && row.paidAt && Date.parse(row.paidAt) >= start && Date.parse(row.paidAt) < start + 86400000)
      .reduce((total, row) => total + Number(row.amountReceived || row.amount), 0);
  });
}
