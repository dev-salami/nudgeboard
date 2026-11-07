import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runChat } from "./agent";
import { resetPaypalRail } from "./provider";
import { blankStore } from "./store";

beforeEach(() => {
  vi.stubEnv("DATA_DIR", mkdtempSync(path.join(tmpdir(), "paypal-agent-test-")));
  resetPaypalRail();
  blankStore();
});

describe("free-text AI agent", () => {
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
});
