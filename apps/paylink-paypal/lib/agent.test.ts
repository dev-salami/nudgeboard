import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runChat } from "./agent";
import { getPaypalRail, resetPaypalRail } from "./provider";
import { blankStore, getDb, updateDb } from "./store";
import type { PaypalInvoice } from "./types";

beforeEach(() => {
  vi.stubEnv("DATA_DIR", mkdtempSync(path.join(tmpdir(), "paypal-agent-test-")));
  resetPaypalRail();
  blankStore();
});

describe("free-text AI agent", () => {
  it.each(["What's unpaid?", "Summarize receivables", "Draft a friendly reminder for an invoice"])("keeps the generic prompt %s safe on an empty store", async (message) => {
    const response = await runChat({ message }, "http://localhost:3030");
    expect(response.invoice).toBeUndefined();
    expect(response.confirmation).toBeUndefined();
    expect(getDb().invoices).toHaveLength(0);
    expect(getDb().emails).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses existing provider tools to extract a free-text invoice and relative due date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
    vi.stubEnv("LLM_API_KEY", "fake-key");
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ message: { tool_calls: [{ function: {
      name: "create_invoice", arguments: JSON.stringify({ clientName: "Ada", clientEmail: "ada@example.com", amount: "480", description: "Logo", dueDate: "tomorrow", asDraft: true }),
    } }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await runChat({ message: "Please prepare a bill for Ada: four hundred eighty dollars for her logo, due tomorrow. Her email is ada@example.com." }, "http://localhost:3030");
    expect(response.mode).toBe("llm");
    expect(response.paypal).toBe("demo");
    expect(response.invoice).toMatchObject({ status: "draft", amount: "480.00", dueDate: "2026-11-08", clientName: "Ada" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.messages[0].content).toContain("2026-11-07");
    expect(payload.tools.some((tool: { function: { name: string } }) => tool.function.name === "create_invoice")).toBe(true);
  });

  it("keeps a no-env deterministic invoice demo working without network", async () => {
    const response = await runChat({ message: "Invoice Ada Lovelace ada@example.com 480 USD for the logo, due Friday" }, "http://localhost:3030");
    expect(response.mode).toBe("demo");
    expect(response.invoice?.status).toBe("draft");
    expect(response.invoice?.payment).toBeUndefined();
    expect(response.confirmation?.state).toBe("pending");
    expect(response.invoice?.amount).toBe("480.00");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores model-manufactured paid status and never exposes a confirmation tool", async () => {
    vi.stubEnv("LLM_API_KEY", "fake-key");
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ message: { content: "Paid and sent!", tool_calls: [{ function: {
      name: "create_invoice", arguments: JSON.stringify({ clientName: "Ada", clientEmail: "ada@example.com", amount: "150", description: "Logo", dueDate: "2026-12-01", status: "paid", paidAt: "2026-11-01", txSignature: "fake", asDraft: false }),
    } }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await runChat({ message: "Prepare a bill for Ada, ada@example.com, one hundred fifty dollars for logo, due December 1" }, "http://localhost:3030");
    expect(response.invoice?.status).toBe("draft");
    expect(response.invoice?.paidAt).toBeUndefined();
    expect(response.invoice?.txSignature).toBeUndefined();
    expect(response.invoice?.payment).toBeUndefined();
    expect(response.reply).toContain("Nothing was sent");
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.tools.some((tool: { function: { name: string } }) => /confirm|mark_paid/.test(tool.function.name))).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clarifies multiple model tool calls instead of choosing the first", async () => {
    vi.stubEnv("LLM_API_KEY", "fake-key");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { tool_calls: [
      { function: { name: "send_reminder", arguments: '{"query":"Ada"}' } },
      { function: { name: "send_reminder", arguments: '{"query":"Mina"}' } },
    ] } }] })));
    const response = await runChat({ message: "Follow up with the client" }, "http://localhost:3030");
    expect(response.confirmation).toBeUndefined();
    expect(response.reply).toMatch(/clarify/);
  });

  it.each(["summary", "summarize receivables"])("%s restores grounded ledger totals and optional model priorities without sending", async (message) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
    vi.stubEnv("LLM_API_KEY", "fake-key");
    vi.stubEnv("LLM_BASE_URL", "https://model.example.test/v1");
    const invoice: PaypalInvoice = { id: "open", number: "PP-2026-2001", clientName: "Ada", description: "Logo", amount: "480.00", currency: "USD", dueDate: "2026-11-01", status: "expired", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z" };
    updateDb((db) => { db.invoices = [invoice,
      { ...invoice, id: "partial", number: "PP-2026-2002", amount: "200.00", amountReceived: "50.00", status: "underpaid", dueDate: "2026-12-01" },
      { ...invoice, id: "draft", amount: "75.00", status: "draft" },
      { ...invoice, id: "paid", status: "paid" },
      { ...invoice, id: "sample", sample: true },
      { ...invoice, id: "cancelled", paypalStatus: "CANCELLED" },
      { ...invoice, id: "refunded", paypalStatus: "REFUNDED" },
    ]; });
    // Even fabricated tool calls in a summary response cannot dispatch actions.
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ message: {
      content: "Review Ada's overdue invoice first.", tool_calls: [{ function: { name: "send_reminder", arguments: '{"query":"open"}' } }],
    } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const rail = getPaypalRail();
    const create = vi.spyOn(rail, "createRequest"); const deliver = vi.spyOn(rail, "deliver");
    const chase = vi.spyOn(rail, "chase"); const lookup = vi.spyOn(rail, "lookup");
    const before = JSON.stringify(getDb());
    const response = await runChat({ message }, "http://localhost:3030");
    expect(response.reply).toContain("3 open invoices");
    expect(response.reply).toContain("630.00 USD receivable"); // 480 + (200 - 50); drafts excluded.
    expect(response.reply).toContain("1 overdue (480.00 USD)");
    expect(response.reply).toContain("1 drafts");
    expect(response.reply).toContain("Review Ada's overdue invoice first.");
    expect(response.confirmation).toBeUndefined();
    expect(JSON.stringify(getDb())).toBe(before);
    expect(create).not.toHaveBeenCalled(); expect(deliver).not.toHaveBeenCalled();
    expect(chase).not.toHaveBeenCalled(); expect(lookup).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://model.example.test/v1/chat/completions");
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(payload.tools).toBeUndefined();
    expect(JSON.parse(payload.messages[1].content).map((row: { number: string }) => row.number)).toHaveLength(3);
  });

  it("keeps summary useful without a model key and makes no external request", async () => {
    const response = await runChat({ message: "summarize receivables" }, "http://localhost:3030");
    expect(response.reply).toContain("0 open invoices");
    expect(response.reply).toContain("0.00 USD receivable");
    expect(response.reply).toContain("No overdue receivables. Review drafts before sending.");
    expect(getDb().confirmations).toHaveLength(0); expect(getDb().emails).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
