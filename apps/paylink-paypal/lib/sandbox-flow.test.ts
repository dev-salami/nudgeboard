import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeDemoPayment, findInvoice, issueInvoice, pollSandboxInvoices, remindInvoice, sendExisting, syncInvoice } from "./invoices";
import { paypalApiBase } from "./env";
import { blankStore, getDb } from "./store";
import { resetPaypalRail } from "./provider";
import { prepareConfirmation, prepareReminderConfirmation } from "./confirmations";

beforeEach(() => {
  vi.stubEnv("DATA_DIR", mkdtempSync(path.join(tmpdir(), "paypal-sandbox-test-")));
  vi.stubEnv("PAYPAL_CLIENT_ID", "fake-sandbox-id");
  vi.stubEnv("PAYPAL_CLIENT_SECRET", "fake-sandbox-secret");
  resetPaypalRail();
  blankStore();
});

const input = { clientName: "Ada", clientEmail: "ada@example.com", amount: "150", description: "Logo", dueDate: "2026-12-01", asDraft: false, origin: "http://localhost:3030" };
async function confirmedInvoice() {
  const invoice = await issueInvoice(input);
  return sendExisting(invoice.id, input.origin, prepareConfirmation(invoice.id, "send", input.origin).id);
}

function sandbox() {
  let status = "DRAFT";
  let failSend = false;
  let unavailable = false;
  const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
    const pathname = new URL(String(url)).pathname;
    expect(String(url)).toMatch(/^https:\/\/api-m\.sandbox\.paypal\.com\//);
    if (pathname.endsWith("/token")) return Response.json({ access_token: "fake-token", expires_in: 300 });
    if (unavailable) return Response.json({ message: "Sandbox unavailable" }, { status: 503 });
    if (pathname.endsWith("/invoices")) return Response.json({ id: "INV2-FLOW", status: "DRAFT" }, { status: 201 });
    if (pathname.endsWith("/send")) {
      if (failSend) return Response.json({ message: "Send rejected" }, { status: 422 });
      status = "SENT";
      return new Response(null, { status: 202 });
    }
    expect(init?.method).toBe("GET");
    return Response.json({ id: "INV2-FLOW", status, detail: { metadata: { recipient_view_url: "https://www.sandbox.paypal.com/invoice/p/#INV2-FLOW" } }, payments: status === "PAID" ? { paid_amount: { value: "150.00" }, transactions: [{ transaction_id: "TX-REAL-MOCK", amount: { value: "150.00" } }] } : undefined });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, paid: () => { status = "PAID"; }, failSend: (value: boolean) => { failSend = value; }, unavailable: () => { unavailable = true; } };
}

describe("mocked sandbox merchant and receipt lifecycle", () => {
  it("polls real remote state, updates merchant book, and writes exactly one receipt", async () => {
    const remote = sandbox();
    const invoice = await confirmedInvoice();
    expect(invoice.payment?.hostedUrl).toContain("www.sandbox.paypal.com");
    expect(invoice.status).toBe("pending");
    expect(() => completeDemoPayment(invoice.id)).toThrow(/sandbox/);
    remote.paid();
    await pollSandboxInvoices();
    expect(findInvoice(invoice.id)).toMatchObject({ status: "paid", paypalStatus: "PAID", txSignature: "TX-REAL-MOCK" });
    expect(getDb().receipts).toHaveLength(1);
    expect(getDb().receipts[0]).toMatchObject({ paypalInvoiceId: "INV2-FLOW", transactionId: "TX-REAL-MOCK" });
    await syncInvoice(invoice.id);
    expect(getDb().receipts).toHaveLength(1);
    const calls = remote.fetchMock.mock.calls.length;
    expect((await remindInvoice(invoice.id)).refusal).toMatch(/already paid/);
    expect(remote.fetchMock).toHaveBeenCalledTimes(calls);
  });

  it("persists a draft reference on send error and blocks an ambiguous retry", async () => {
    const remote = sandbox();
    remote.failSend(true);
    const draft = await issueInvoice(input);
    const preview = prepareConfirmation(draft.id, "send", input.origin);
    await expect(sendExisting(draft.id, input.origin, preview.id)).rejects.toThrow(/automatic retry is blocked/);
    expect(draft.payment?.reference).toBe("INV2-FLOW");
    expect(draft.status).toBe("draft");
    remote.failSend(false);
    await expect(sendExisting(draft.id, input.origin, preview.id)).rejects.toThrow(/uncertain/);
    expect(() => prepareConfirmation(draft.id, "send", input.origin)).toThrow(/review|reconciliation/);
    const creates = remote.fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith("/invoices") && init?.method === "POST");
    expect(creates).toHaveLength(1);
  });

  it("retains pending state and records errors rather than inventing payment or sending reminders", async () => {
    const remote = sandbox();
    const invoice = await confirmedInvoice();
    const preview = await prepareReminderConfirmation(invoice.id, input.origin);
    remote.unavailable();
    expect(await syncInvoice(invoice.id)).toMatchObject({ status: "pending", paymentIssue: "rpc_down" });
    expect(getDb().receipts).toHaveLength(0);
    await expect(remindInvoice(invoice.id, input.origin, preview.id)).rejects.toThrow(/automatic retry is blocked/);
  });

  it("rechecks sandbox payment state at reminder confirmation and refuses a newly paid invoice", async () => {
    const remote = sandbox();
    const invoice = await confirmedInvoice();
    const preview = await prepareReminderConfirmation(invoice.id, input.origin);
    const before = remote.fetchMock.mock.calls.length;
    expect((await prepareReminderConfirmation(invoice.id, input.origin)).id).toBe(preview.id);
    expect(remote.fetchMock).toHaveBeenCalledTimes(before); // Preview cannot even poll.
    remote.paid();
    await expect(remindInvoice(invoice.id, input.origin, preview.id)).rejects.toThrow(/automatic retry is blocked/);
    expect(invoice.status).toBe("paid");
    expect(getDb().receipts).toHaveLength(1);
    expect(remote.fetchMock.mock.calls.some(([url]) => String(url).endsWith("/remind"))).toBe(false);
    expect(getDb().emails).toHaveLength(0);
  });

  it("rejects a live environment and missing recipient before creating an invoice", async () => {
    vi.stubEnv("PAYPAL_ENVIRONMENT", "live");
    expect(() => paypalApiBase()).toThrow(/Only PayPal sandbox/);
    vi.stubEnv("PAYPAL_ENVIRONMENT", "sandbox");
    const draft = await issueInvoice({ ...input, clientEmail: undefined });
    expect(() => prepareConfirmation(draft.id, "send", input.origin)).toThrow(/email/);
    expect(draft.status).toBe("draft");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses to send an unverified legacy remote sandbox draft from a local preview", async () => {
    const draft = await issueInvoice(input);
    draft.payment = { provider: "paypal", reference: "INV2-LEGACY", url: "", recipient: "merchant@example.com", asset: "USD", network: "paypal-sandbox", status: "DRAFT" };
    expect(() => prepareConfirmation(draft.id, "send", input.origin)).toThrow(/Legacy remote draft/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
