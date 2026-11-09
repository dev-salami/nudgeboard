import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as health } from "../app/api/health/route";
import { POST as webhook } from "../app/api/webhooks/paypal/route";
import { completeDemoPayment, issueInvoice, syncInvoice, totals } from "./invoices";
import { modeInvoices } from "./ledger";
import { resetPaypalRail } from "./provider";
import { prepareReminderConfirmation } from "./confirmations";
import { blankStore, getDb, resetStore, updateDb } from "./store";

beforeEach(() => {
  vi.stubEnv("DATA_DIR", mkdtempSync(path.join(tmpdir(), "paypal-real-mode-")));
  vi.stubEnv("PAYPAL_CLIENT_ID", "fake-sandbox-id");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "fake-sandbox-secret");
  resetPaypalRail(); blankStore();
});

async function sent() {
  const row = await issueInvoice({ clientName: "Ada", clientEmail: "ada@example.com", amount: "150", description: "Logo", dueDate: "2026-12-01", asDraft: true });
  updateDb(() => {
    row.status = "pending"; row.paypalStatus = "SENT";
    row.payment = { provider: "paypal", reference: "INV2-EVIDENCE", network: "paypal-sandbox", status: "SENT", asset: "USD", url: "", recipient: "merchant@example.test" };
  });
  return row;
}

describe("sandbox evidence and grounded books", () => {
  it("starts sandbox with an empty ledger and reports sandbox health", async () => {
    const db = resetStore();
    expect(db.invoices).toHaveLength(0); expect(db.receipts).toHaveLength(0); expect(db.activities).toHaveLength(0);
    expect(await health().json()).toMatchObject({ paypal: "sandbox" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("labels demo samples and omits historical demo data from sandbox views and totals", () => {
    vi.stubEnv("PAYPAL_MODE", "demo");
    const db = resetStore();
    expect(db.invoices.every((row) => row.sample)).toBe(true);
    expect(db.receipts.every((row) => row.sample)).toBe(true);
    vi.stubEnv("PAYPAL_MODE", "");
    expect(modeInvoices(db.invoices, "sandbox")).toHaveLength(0);
    expect(totals()).toMatchObject({ outstanding: 0, collected: 0, overdue: 0 });
    expect(() => completeDemoPayment(db.invoices[0]!.id)).toThrow(/sandbox/);
  });

  it.each([{ amountPaid: "150.00" }, { transactionId: "TX-MOCK" }, {}] as { amountPaid?: string; transactionId?: string }[])("does not issue polling receipts with incomplete evidence: %j", async (evidence) => {
    const row = await sent();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith("/token")) return Response.json({ access_token: "mock-token", expires_in: 300 });
      return Response.json({ id: "INV2-EVIDENCE", status: "PAID", payments: {
        paid_amount: evidence.amountPaid ? { value: evidence.amountPaid } : undefined,
        transactions: evidence.transactionId ? [{ transaction_id: evidence.transactionId }] : [],
      } });
    }));
    await syncInvoice(row.id);
    expect(row.status).not.toBe("paid"); expect(row.receiptId).toBeUndefined();
    expect(getDb().receipts).toHaveLength(0);
    expect(row.paypalStatus).toBe("PAID"); // Still blocks reminder eligibility.
  });

  it("nets partial payments and excludes cancelled receivables", async () => {
    const row = await sent();
    updateDb((db) => {
      row.status = "underpaid"; row.amountReceived = "40.00";
      db.invoices.push({ ...row, id: "cancelled", paypalStatus: "CANCELLED", status: "expired" });
    });
    expect(totals()).toMatchObject({ outstanding: 110, overdue: 0 });
  });

  it("requires webhook configuration and a verified signature, then requires real payment evidence", async () => {
    const row = await sent();
    const event = { id: "WH-EVIDENCE", event_type: "INVOICING.INVOICE.PAID", resource: { id: row.payment!.reference, status: "PAID" } };
    const post = () => webhook(new Request("http://localhost:3030/api/webhooks/paypal", {
      method: "POST", body: JSON.stringify(event), headers: {
        "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.sandbox.paypal.com/cert/mock",
        "paypal-transmission-id": "mock-transmission", "paypal-transmission-sig": "mock-signature", "paypal-transmission-time": "2026-11-09T12:00:00Z",
      },
    }));
    expect((await post()).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "mock-webhook"); resetPaypalRail();
    let verified = false;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (url) => String(url).endsWith("/token")
      ? Response.json({ access_token: "mock-token", expires_in: 300 })
      : Response.json({ verification_status: verified ? "SUCCESS" : "FAILURE" })));
    expect((await post()).status).toBe(400);
    expect(getDb().webhookIds).toHaveLength(0);
    verified = true;
    expect((await post()).status).toBe(200);
    expect(row.status).not.toBe("paid"); expect(getDb().receipts).toHaveLength(0);
    await expect(prepareReminderConfirmation(row.id)).rejects.toThrow(/not eligible/);
  });
});
