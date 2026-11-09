import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runChat } from "./agent";
import { prepareConfirmation, prepareReminderConfirmation } from "./confirmations";
import { issueInvoice, remindInvoice, sendExisting } from "./invoices";
import { getPaypalRail, resetPaypalRail } from "./provider";
import { blankStore, getDb, updateDb } from "./store";
import { POST } from "../app/api/invoices/[id]/remind/route";

const origin = "http://localhost:3030";
beforeEach(() => {
  vi.stubEnv("DATA_DIR", mkdtempSync(path.join(tmpdir(), "paypal-reminder-ai-")));
  resetPaypalRail(); blankStore();
});

async function invoice() {
  const row = await issueInvoice({ clientName: "Ada Lovelace", clientEmail: "ada@example.com", amount: "150", description: "Logo", dueDate: "2026-12-01", asDraft: true });
  await sendExisting(row.id, origin, prepareConfirmation(row.id, "send", origin).id);
  return row;
}

function model() {
  vi.stubEnv("LLM_API_KEY", "fake-model-key");
  vi.stubEnv("LLM_BASE_URL", "https://model.example.test/v1");
  const mock = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ message: { content: "Please let us know when you can arrange payment." } }] }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("live reminder preview and explicit delivery", () => {
  it.each(["friendly", "firm", "empathetic"] as const)("drafts a %s reminder through AI, without PayPal or mail", async (tone) => {
    const row = await invoice();
    const mock = model();
    const chase = vi.spyOn(getPaypalRail(), "chase");
    const response = await runChat({ message: `Draft a ${tone} reminder for ${row.number}` }, origin);
    expect(response.confirmation).toMatchObject({ action: "remind", state: "pending", tone });
    const message = response.confirmation!.preview.message;
    for (const fact of ["Please let us know when you can arrange payment.", row.number, "150.00 USD", row.dueDate, `${origin}/pay/${row.id}`]) expect(message).toContain(fact);
    expect(message).not.toContain("Draft — not sent");
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]?.[0]).toBe("https://model.example.test/v1/chat/completions");
    expect(String(mock.mock.calls[0]?.[1]?.body)).toContain(tone);
    expect(chase).not.toHaveBeenCalled(); expect(getDb().emails).toHaveLength(0);
    for (const text of ["yes", "confirm", "send it"]) expect((await runChat({ message: text }, origin)).confirmation).toBeUndefined();
    expect(chase).not.toHaveBeenCalled();
  });

  it.each(["friendly", "firm", "empathetic"] as const)("uses the %s fallback without a model key", async (tone) => {
    const row = await invoice();
    const response = await runChat({ message: `Draft a ${tone} reminder for ${row.number}` }, origin);
    expect(response.confirmation?.preview.message).toContain(tone === "firm" ? "payment remains outstanding" : tone === "empathetic" ? "If timing is difficult" : "a friendly reminder");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("defaults the route to friendly and replaces old tone previews, reusing identical retries", async () => {
    const row = await invoice();
    const request = new Request(`${origin}/api/invoices/${row.id}/remind`, { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ id: row.id }) });
    const { confirmation } = await response.json();
    expect(confirmation.tone).toBe("friendly");
    expect((await prepareReminderConfirmation(row.id, origin)).id).toBe(confirmation.id);
    const firm = await prepareReminderConfirmation(row.id, origin, "firm");
    expect(firm.id).not.toBe(confirmation.id);
    expect(getDb().confirmations.find((record) => record.id === confirmation.id)?.state).toBe("stale");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["PAID", "DRAFT", "CANCELLED", "REFUNDED", "PAYMENT_PENDING"])("refuses %s before AI or PayPal", async (status) => {
    const row = await invoice();
    updateDb(() => { row.paypalStatus = status; if (status === "DRAFT") row.status = "draft"; if (status === "PAID") row.status = "paid"; });
    const mock = model();
    await expect(prepareReminderConfirmation(row.id, origin, "firm")).rejects.toThrow();
    expect(mock).not.toHaveBeenCalled();
  });

  it("refuses a snapshot change while awaiting the model", async () => {
    const row = await invoice();
    model().mockImplementation(async () => {
      updateDb(() => { row.amount = "200.00"; });
      return Response.json({ choices: [{ message: { content: "Please arrange payment." } }] });
    });
    await expect(prepareReminderConfirmation(row.id, origin)).rejects.toThrow(/changed/);
    expect(getDb().confirmations.some((record) => record.action === "remind")).toBe(false);
  });

  it("rechecks sandbox status and sends the exact stored AI body as the PayPal note, without regenerating", async () => {
    const row = await invoice();
    vi.stubEnv("PAYPAL_CLIENT_ID", "fake-sandbox-id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "fake-sandbox-secret");
    resetPaypalRail();
    updateDb(() => { row.payment!.network = "paypal-sandbox"; row.payment!.reference = "INV2-MOCK"; });
    const mock = model();
    const preview = await prepareReminderConfirmation(row.id, origin, "firm");
    expect(mock).toHaveBeenCalledTimes(1); // Model only; no PayPal until explicit confirmation.
    const note = preview.preview.message;
    mock.mockClear();
    mock.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      expect(new URL(String(url)).hostname).toBe("api-m.sandbox.paypal.com");
      if (path.endsWith("/token")) return Response.json({ access_token: "mock-token", expires_in: 300 });
      if (path.endsWith("/remind")) {
        expect(JSON.parse(String(init?.body)).note).toBe(note);
        return new Response(null, { status: 202 });
      }
      expect(init?.method).toBe("GET");
      return Response.json({ id: "INV2-MOCK", status: "SENT" });
    });
    await remindInvoice(row.id, origin, preview.id);
    expect(preview.state).toBe("done");
    expect(mock.mock.calls.filter(([url]) => String(url).endsWith("/remind"))).toHaveLength(1);
    expect(getDb().emails).toHaveLength(0);
  });
});
