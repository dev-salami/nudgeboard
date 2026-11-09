import { describe, expect, it, vi } from "vitest";
import { draftReminder, extractInbound, receivablesSummary } from "./ai";
import type { PaypalInvoice } from "./types";

const invoice: PaypalInvoice = {
  id: "inv_ai", number: "PP-2026-1041", clientName: "Ada", clientEmail: "ada@example.com",
  description: "Logo", amount: "480.00", currency: "USD", dueDate: "2026-11-01",
  status: "expired", channel: "email", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z",
};

function model(content: string) {
  vi.stubEnv("LLM_API_KEY", "fake-model-key");
  vi.stubEnv("LLM_BASE_URL", "https://model.example.test/v1");
  vi.stubEnv("LLM_MODEL", "test-model");
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ message: { content } }] }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("AI invoice workflow", () => {
  it.each(["email", "whatsapp"] as const)("extracts %s through the configured model, including resolved due date", async (channel) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
    const fetchMock = model(JSON.stringify({ clientName: "Ada", clientEmail: "ada@example.com", amount: "480", description: "Logo", dueDate: "2026-11-14" }));
    const result = await extractInbound("Ada asked for four hundred eighty dollars for the logo; due in a week.", channel);
    expect(result).toMatchObject({ ok: true, channel, amount: "480.00", dueDate: "2026-11-14" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://model.example.test/v1/chat/completions");
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.model).toBe("test-model");
    expect(payload.messages[0].content).toContain("2026-11-07");
    expect(payload.messages[1].content).toContain(channel);
  });

  it("asks for clarification instead of inventing fields", async () => {
    model('{"needsClarification":true}');
    expect(await extractInbound("Can you invoice the usual amount?", "email")).toMatchObject({ ok: false });
  });

  it("preserves no-key demo extraction and fallback on model failure or malformed output", async () => {
    const raw = "From: Ada <ada@example.com>\nSubject: Logo\n480 USD for logo, due Friday";
    expect(await extractInbound(raw, "email")).toMatchObject({ ok: true, clientName: "Ada", amount: "480" });
    expect(fetch).not.toHaveBeenCalled();
    model("not json");
    expect(await extractInbound(raw, "email")).toMatchObject({ ok: true, amount: "480" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    expect(await extractInbound(raw, "email")).toMatchObject({ ok: true });
  });

  it.each(["friendly", "firm", "empathetic"] as const)("drafts a %s reminder without sending and appends authoritative facts", async (tone) => {
    const fetchMock = model("Please let us know when you can arrange payment.");
    const draft = await draftReminder(invoice, tone, "http://localhost:3030/pay/inv_ai");
    expect(draft).not.toContain("Draft — not sent");
    expect(draft).toContain("Please let us know when you can arrange payment.");
    expect(draft).toContain("480.00 USD");
    expect(draft).toContain(invoice.dueDate);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(tone);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("paypal.com");
  });

  it("refuses paid and draft reminders before requesting AI", async () => {
    model("should not run");
    expect(await draftReminder({ ...invoice, status: "paid" }, "firm", "test")).toMatch(/already paid/);
    expect(await draftReminder({ ...invoice, status: "draft" }, "friendly", "test")).toMatch(/draft/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["", "Pay a late fee now.", "We will take legal action.", "Payment received, thank you.", "This invoice is paid.", "We sent your reminder.", "Pay $900 by tomorrow.", "You will regret this."])("rejects empty, unsafe or invented model text: %s", async (content) => {
    model(content);
    const draft = await draftReminder(invoice, "firm", "http://localhost:3030/pay/inv_ai");
    expect(draft).toContain("payment remains outstanding");
    expect(draft).toContain("PP-2026-1041");
  });

  it.each(["friendly", "firm", "empathetic"] as const)("uses the %s fallback without a key or network", async (tone) => {
    const draft = await draftReminder(invoice, tone, "http://localhost:3030/pay/inv_ai");
    expect(draft).toContain(tone === "firm" ? "payment remains outstanding" : tone === "empathetic" ? "If timing is difficult" : "a friendly reminder");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back when the model is unavailable", async () => {
    model("ignored");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await draftReminder(invoice, "friendly", "test")).toContain("a friendly reminder");
  });

  it("summarizes actual receivables, omitting paid and sample rows", async () => {
    model("Review Ada's overdue invoice first.");
    const summary = await receivablesSummary([invoice, { ...invoice, id: "paid", status: "paid" }, { ...invoice, id: "sample", sample: true }, { ...invoice, id: "draft", status: "draft", amount: "50.00" }]);
    expect(summary).toContain("2 open invoices");
    expect(summary).toContain("480.00 USD receivable");
    expect(summary).toContain("1 overdue (480.00 USD)");
    expect(summary).toContain("1 drafts");
    expect(summary).toContain("Review Ada");
  });
});
