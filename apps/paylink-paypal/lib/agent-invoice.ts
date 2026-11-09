import { balance } from "./ledger";
import type { PaypalInvoice } from "./types";

/** Public allowlist, not a serialization of the merchant's invoice/store object. */
export function agentInvoice(invoice: PaypalInvoice) {
  if (invoice.status === "draft" || invoice.paypalStatus === "DRAFT" || invoice.payment?.status === "DRAFT") return null;
  let hostedPaypalUrl: string | undefined;
  try {
    const url = new URL(invoice.payment?.hostedUrl || "");
    if (url.protocol === "https:" && url.hostname === "www.sandbox.paypal.com" && !url.port && !url.username && !url.password) hostedPaypalUrl = url.href;
  } catch { /* No hosted checkout yet; the local payer path remains available. */ }
  return {
    profile: "paypal-invoice", version: 1,
    number: invoice.number, amount: invoice.amount, currency: invoice.currency, dueDate: invoice.dueDate,
    status: invoice.status, paypalStatus: invoice.paypalStatus,
    remainingBalance: balance(invoice).toFixed(2),
    source: invoice.sample ? "judge-demo" : invoice.payment?.network || "paypal-demo",
    payment: { payPath: `/pay/${encodeURIComponent(invoice.id)}`, hostedPaypalUrl, execution: "Pay on the PayPal-hosted invoice; this endpoint cannot execute payment." },
  };
}
