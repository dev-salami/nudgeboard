import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { applyWebhook, issueInvoice, sendExisting, syncInvoice } from "./invoices";
import { prepareConfirmation } from "./confirmations";
import { blankStore, getDb, updateDb } from "./store";
import { resetPaypalRail } from "./provider";
import { statusEvidence } from "./evidence";
import { POST } from "../app/api/webhooks/paypal/route";
import { GET as health } from "../app/api/health/route";

const origin = "http://localhost:3030";
beforeEach(() => {
  vi.stubEnv("DATA_DIR", mkdtempSync(path.join(tmpdir(), "paypal-evidence-")));
  blankStore(); resetPaypalRail();
});
async function sent() {
  const row = await issueInvoice({ clientName: "Fictional", amount: "120", dueDate: "2026-12-01", description: "Design", asDraft: true });
  await sendExisting(row.id, origin, prepareConfirmation(row.id, "send", origin).id);
  return row;
}
it.each(["PAID", "PARTIALLY_PAID", "CANCELLED", "REFUNDED"])("stores and surfaces event ids for %s, deduplicating history", async (status) => {
  const row = await sent();
  const event = { id: `WH-${status}`, event_type: `INVOICING.INVOICE.${status === "PARTIALLY_PAID" ? "PAID" : status}`, resource: {
    id: row.payment!.reference, status,
    payments: { paid_amount: { value: status === "PARTIALLY_PAID" ? "40.00" : "120.00" }, transactions: [{ transaction_id: "VERIFIED-TX" }] },
    refunds: status === "REFUNDED" ? { refund_amount: { value: "120.00" } } : undefined,
  } };
  expect(applyWebhook(event).ok).toBe(true);
  expect(row.lastPaypalEventId).toBe(event.id);
  expect(statusEvidence(row)).toContain(event.id);
  expect(row.statusHistory?.at(-1)).toMatchObject({ eventId: event.id, source: "webhook", paypalStatus: status });
  expect(getDb().activities.filter((a) => a.invoiceId === row.id && a.kind === "status_changed").every((a) => a.detail?.includes(event.id))).toBe(true);
  if (status === "PAID") expect(getDb().receipts[0]?.lastPaypalEventId).toBe(event.id);
  if (status === "PARTIALLY_PAID") expect(row).toMatchObject({ status: "underpaid", amountReceived: "40.00" });
  if (status === "REFUNDED") expect(row.amountRefunded).toBe("120.00");
  const count = row.statusHistory!.length;
  expect(applyWebhook(event).duplicate).toBe(true);
  expect(row.statusHistory).toHaveLength(count);
});
it("marks successful GET reconciliation as GET, not as a new webhook", async () => {
  const row = await sent();
  applyWebhook({ id: "WH-OLD", event_type: "INVOICING.INVOICE.UPDATED", resource: { id: row.payment!.reference, status: "SENT" } });
  await syncInvoice(row.id);
  expect(row.lastPaypalEventId).toBe("WH-OLD");
  expect(statusEvidence(row)).toBe("PayPal invoice GET (no webhook id)");
});
it("rejects unset and invalid sandbox verification without mutating the ledger", async () => {
  const row = await sent();
  updateDb(() => { row.payment!.network = "paypal-sandbox"; });
  vi.stubEnv("PAYPAL_CLIENT_ID", "mock"); vi.stubEnv("PAYPAL_CLIENT_SECRET", "mock");
  const event = { id: "WH-NOT-VERIFIED", event_type: "INVOICING.INVOICE.PAID", resource: { id: row.payment!.reference, status: "PAID" } };
  const request = () => new Request(`${origin}/api/webhooks/paypal`, { method: "POST", headers: {
    "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.sandbox.paypal.com/test-cert", "paypal-transmission-id": "mock",
    "paypal-transmission-sig": "mock", "paypal-transmission-time": "2026-11-09T00:00:00Z",
  }, body: JSON.stringify(event) });
  expect((await POST(request())).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "test-webhook-id"); resetPaypalRail();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("/token") ? { access_token: "mock", expires_in: 300 } : { verification_status: "FAILURE" })));
  expect((await POST(request())).status).toBe(400);
  expect(row.status).toBe("pending"); expect(row.lastPaypalEventId).toBeUndefined(); expect(getDb().webhookIds).toEqual([]);
});
it("health reports readiness without returning configured values", async () => {
  expect((await health().json()).webhook).toBe("unconfigured");
  vi.stubEnv("PAYPAL_WEBHOOK_ID", "test-webhook-id");
  const json = await health().json();
  expect(json.webhook).toBe("ready"); expect(JSON.stringify(json)).not.toContain("test-webhook-id");
});
it("applies a sandbox event only after mocked PayPal verification succeeds", async () => {
  const row = await sent();
  updateDb(() => { row.payment!.network = "paypal-sandbox"; });
  vi.stubEnv("PAYPAL_CLIENT_ID", "mock"); vi.stubEnv("PAYPAL_CLIENT_SECRET", "mock"); vi.stubEnv("PAYPAL_WEBHOOK_ID", "mock-webhook");
  resetPaypalRail();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("/token") ? { access_token: "mock", expires_in: 300 } : { verification_status: "SUCCESS" })));
  const response = await POST(new Request(`${origin}/api/webhooks/paypal`, { method: "POST", headers: {
    "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.sandbox.paypal.com/test-cert", "paypal-transmission-id": "mock",
    "paypal-transmission-sig": "mock", "paypal-transmission-time": "2026-11-09T00:00:00Z",
  }, body: JSON.stringify({ id: "WH-VERIFIED", event_type: "INVOICING.INVOICE.CANCELLED", resource: { id: row.payment!.reference } }) }));
  expect(response.status).toBe(200);
  expect(row).toMatchObject({ paypalStatus: "CANCELLED", lastPaypalEventId: "WH-VERIFIED" });
  expect(statusEvidence(row)).toBe("PayPal webhook: WH-VERIFIED");
});
