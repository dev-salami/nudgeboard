import type { PaypalInvoice } from "./types";

export const JUDGE_DEMO_LABEL = "Judge demo data — not PayPal sandbox invoices";

/** Pure, credential-free, clock-injected fixtures. Never persisted in sandbox books. */
export function judgeDemoInvoices(now = new Date()): PaypalInvoice[] {
  const date = (days: number) => new Date(now.getTime() + days * 86400000).toISOString();
  function invoice(id: string, clientName: string, amount: string, dueDays: number, extra: Partial<PaypalInvoice> = {}): PaypalInvoice {
    const status = extra.paypalStatus || (extra.status === "paid" ? "PAID" : "SENT");
    return { id, sample: true, source: "judge-demo", number: `PP-DEMO-${id.replace("inv_demo_", "").toUpperCase()}`, clientName,
      clientEmail: `accounts@${clientName.toLowerCase().replace(/[^a-z]/g, "")}.example`, amount, currency: "USD", description: "Fictional design services",
      dueDate: date(dueDays).slice(0, 10), status: dueDays < 0 ? "expired" : "pending", createdAt: date(dueDays - 10), updatedAt: date(-1),
      payment: { provider: "paypal", reference: `DEMO-INV2-${id}`, url: `/pay/${id}`, recipient: "merchant@studio.example", asset: "USD", network: "paypal-demo", status },
      paypalStatus: status, ...extra };
  }
  return [
    invoice("inv_demo_northwind", "Northwind", "220.00", -4),
    invoice("inv_demo_harbour", "Harbour", "480.00", -11, { status: "paid", paidAt: date(-2), amountReceived: "480.00", txSignature: "DEMO-TX-HARBOUR", receiptId: "rcp_demo_harbour" }),
    ...[0, 1, 2].map((i) => invoice(`inv_demo_harbour_history_${i}`, "Harbour", "360.00", -31 - i * 12, { status: "paid", paidAt: date(-22 - i * 12), amountReceived: "360.00", txSignature: `DEMO-TX-HISTORY-${i}` })),
    invoice("inv_demo_harbour_open", "Harbour", "1500.00", -18),
    invoice("inv_demo_summit", "Summit", "4200.00", -32, { lastRemindedAt: date(-14) }),
    invoice("inv_demo_small", "Pebble", "12.00", -45),
    invoice("inv_demo_partial", "Willow", "120.00", -7, { status: "underpaid", paypalStatus: "PARTIALLY_PAID", amountReceived: "40.00", lastPaymentAt: date(-2) }),
    invoice("inv_demo_cancelled", "Orchard", "85.00", -20, { paypalStatus: "CANCELLED" }),
    invoice("inv_demo_refunded", "Cove", "95.00", -18, { status: "paid", paypalStatus: "REFUNDED", amountReceived: "95.00", amountRefunded: "95.00", paidAt: date(-15) }),
    ...[1, 4, 6, 8, 11, 14, 17, 20, 23].map((days, i) => invoice(`inv_demo_paid_${i}`, `Meadow ${i + 1}`, `${160 + i * 35}.00`, -days - 2, { status: "paid", paidAt: date(-days), amountReceived: `${160 + i * 35}.00`, txSignature: `DEMO-TX-${i}` })),
  ];
}
