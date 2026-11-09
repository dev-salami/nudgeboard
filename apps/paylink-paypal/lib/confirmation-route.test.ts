import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../app/api/confirmations/[id]/route";
import { prepareConfirmation, prepareReminderConfirmation } from "./confirmations";
import { issueInvoice, sendExisting } from "./invoices";
import { getPaypalRail, resetPaypalRail } from "./provider";
import { blankStore, getDb } from "./store";
import type { ActionConfirmation } from "./types";

const origin = "http://localhost:3030";
beforeEach(() => {
  vi.stubEnv("DATA_DIR", mkdtempSync(path.join(tmpdir(), "paypal-confirmation-route-")));
  resetPaypalRail(); blankStore();
});

async function preview(action: ActionConfirmation["action"] = "send") {
  const invoice = await issueInvoice({ clientName: "Ada", clientEmail: "ada@example.com", amount: "150", description: "Logo", dueDate: "2026-12-01", asDraft: true });
  if (action === "remind") await sendExisting(invoice.id, origin, prepareConfirmation(invoice.id, "send", origin).id); // Local demo only.
  return action === "remind" ? prepareReminderConfirmation(invoice.id, origin) : prepareConfirmation(invoice.id, "send", origin);
}

function decide(record: ActionConfirmation, body: unknown, headers: Record<string, string> = {}) {
  return POST(new Request(`${origin}/api/confirmations/${record.id}`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), { params: Promise.resolve({ id: record.id }) });
}
const decision = (record: ActionConfirmation) => ({ decision: "confirm", invoiceId: record.invoiceId, action: record.action });

describe("HTTP confirmation contract — local demo transport only; unmocked fetch blocked", () => {
  it.each([{ Origin: "https://attacker.example.test" }, { "sec-fetch-site": "cross-site" }] as Record<string, string>[])("rejects cross-origin/cross-site posts: %j", async (headers) => {
    const record = await preview();
    const create = vi.spyOn(getPaypalRail(), "createRequest");
    expect((await decide(record, decision(record), headers)).status).toBe(403);
    expect(record.state).toBe("pending"); expect(create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["{", "null", "[]", "{}", '{"decision":true}', '{"decision":"yes"}'])("rejects malformed or missing decisions: %s", async (body) => {
    const record = await preview();
    const create = vi.spyOn(getPaypalRail(), "createRequest");
    expect((await decide(record, body)).status).toBe(400);
    expect(record.state).toBe("pending"); expect(create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["invoiceId", "action"] as const)("rejects a mismatched %s", async (field) => {
    const record = await preview();
    const body = { ...decision(record), [field]: field === "action" ? "remind" : "another-invoice" };
    const create = vi.spyOn(getPaypalRail(), "createRequest");
    expect((await decide(record, body)).status).toBe(400);
    expect(record.state).toBe("pending"); expect(create).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects non-JSON confirmation posts before dispatch", async () => {
    const record = await preview();
    expect((await decide(record, decision(record), { "Content-Type": "text/plain" })).status).toBe(403);
    expect(record.state).toBe("pending"); expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["send", "remind"] as const)("dispatches an explicit %s decision once and never dispatches a completed replay", async (action) => {
    const record = await preview(action);
    const rail = getPaypalRail();
    const create = vi.spyOn(rail, "createRequest"); const deliver = vi.spyOn(rail, "deliver");
    const chase = vi.spyOn(rail, "chase");
    const response = await decide(record, decision(record));
    expect(response.status).toBe(200);
    expect((await response.json()).confirmation.state).toBe("done");
    const after = JSON.stringify(getDb());
    const replay = await decide(record, decision(record));
    expect(replay.status).toBe(200);
    expect((await replay.json()).message).toContain("No action repeated");
    expect(JSON.stringify(getDb())).toBe(after);
    expect(create).toHaveBeenCalledTimes(action === "send" ? 1 : 0);
    expect(deliver).toHaveBeenCalledTimes(action === "send" ? 1 : 0);
    expect(chase).toHaveBeenCalledTimes(action === "remind" ? 1 : 0);
    expect(getDb().emails).toHaveLength(action === "remind" ? 1 : 0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
