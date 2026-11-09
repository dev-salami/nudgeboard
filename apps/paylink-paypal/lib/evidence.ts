import type { PaypalInvoice } from "./types";

export function statusEvidence(invoice: PaypalInvoice) {
  if (invoice.statusSource === "webhook") return `${invoice.payment?.network === "paypal-demo" ? "Demo webhook" : "PayPal webhook"}: ${invoice.lastPaypalEventId || "event id unavailable"}`;
  if (invoice.statusSource === "paypal-get") return "PayPal invoice GET (no webhook id)";
  if (invoice.statusSource === "confirmed-action") return invoice.sample ? "Confirmed demo action (no webhook id)" : "Confirmed PayPal action (no webhook id)";
  return invoice.sample ? "Judge demo fixture — not PayPal evidence" : "No webhook evidence recorded";
}

export function recordStatusEvidence(invoice: PaypalInvoice, source: NonNullable<PaypalInvoice["statusSource"]>, eventId?: string) {
  invoice.statusSource = source;
  if (eventId) invoice.lastPaypalEventId = eventId;
  invoice.statusHistory ??= [];
  invoice.statusHistory.push({ at: new Date().toISOString(), status: invoice.status, paypalStatus: invoice.paypalStatus, source, eventId });
}
