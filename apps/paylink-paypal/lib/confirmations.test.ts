import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareConfirmation, cancelConfirmation, executeConfirmed } from "./confirmations";
import { issueInvoice, sendExisting, remindInvoice } from "./invoices";
import { blankStore, getDb, updateDb } from "./store";
import { getPaypalRail, resetPaypalRail } from "./provider";
import { runChat } from "./agent";

const origin = "http://localhost:3030";
const input = { clientName: "Ada", clientEmail: "ada@example.com", amount: "150", description: "Logo", dueDate: "2026-12-01", asDraft: false };
beforeEach(() => {
  vi.stubEnv("DATA_DIR", mkdtempSync(path.join(tmpdir(), "paypal-confirmation-")));
  resetPaypalRail();
  blankStore();
});

async function sentInvoice() {
  const invoice = await issueInvoice(input);
  await sendExisting(invoice.id, origin, prepareConfirmation(invoice.id, "send", origin).id);
  return invoice;
}

describe("local previews and explicit confirmation — mocked/local actions only", () => {
  it("previews invoices, reminders and inbox data without ANY external requests", async () => {
    vi.stubEnv("LLM_API_KEY", "fake-key");
    const response = await runChat({ message: "Preview invoice Ada ada@example.com 150 USD for logo, due Friday" }, origin);
    expect(response.invoice?.status).toBe("draft");
    expect(response.invoice?.payment).toBeUndefined();
    expect(response.confirmation?.action).toBe("send");
    const invoice = await sentInvoice(); // in-memory demo provider only
    const reminder = await runChat({ message: `Preview reminder for ${invoice.number}` }, origin);
    expect(reminder.confirmation?.action).toBe("remind");
    const inbox = await runChat({ message: "From: Mina <mina@example.com>\nSubject: Logo\nPlease invoice me 90 USD for logo, due Friday" }, origin);
    expect(inbox.invoice?.status).toBe("draft");
    expect(getDb().emails).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["yes", "confirm", "send it", "remind", "chase all unpaid", "maybe invoice Ada or Mina", "invoice Ada 100 USD and Bob 200 USD", "invoice someone 100 USD", "do not send invoice Ada 150 USD", "mark Ada paid"])("clarifies ambiguous command %s without creating or sending", async (message) => {
    const result = await runChat({ message }, origin);
    expect(result.confirmation).toBeUndefined();
    expect(getDb().invoices).toHaveLength(0);
    expect(getDb().confirmations).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never selects one of multiple client-name matches for a reminder", async () => {
    await sentInvoice(); await sentInvoice();
    const result = await runChat({ message: "Remind Ada" }, origin);
    expect(result.confirmation).toBeUndefined();
    expect(result.reply).toMatch(/exact invoice/);
    expect(getDb().emails).toHaveLength(0);
  });

  it("requires exact invoice/action binding and a separate confirmation", async () => {
    const first = await issueInvoice(input);
    const second = await issueInvoice({ ...input, description: "Another logo" });
    const token = prepareConfirmation(first.id, "send", origin);
    const create = vi.spyOn(getPaypalRail(), "createRequest");
    await expect(sendExisting(first.id, origin)).rejects.toThrow(/explicitly confirm/);
    await expect(sendExisting(second.id, origin, token.id)).rejects.toThrow(/does not match/);
    const dispatch = vi.fn(async () => first);
    await expect(executeConfirmed(token.id, first.id, "remind", origin, dispatch)).rejects.toThrow(/does not match/);
    expect(dispatch).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(getDb().emails).toHaveLength(0);
  });

  it("reuses an identical retried local invoice preview instead of creating a second send token", async () => {
    const message = "Invoice Ada ada@example.com 150 USD for logo, due Friday";
    const first = await runChat({ message }, origin);
    const retry = await runChat({ message }, origin);
    expect(retry.invoice?.id).toBe(first.invoice?.id);
    expect(retry.confirmation?.id).toBe(first.confirmation?.id);
    expect(getDb().invoices).toHaveLength(1);
    expect(getDb().confirmations).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("revalidates state after remote draft creation, before delivery", async () => {
    const invoice = await issueInvoice(input);
    const token = prepareConfirmation(invoice.id, "send", origin);
    const rail = getPaypalRail();
    const create = rail.createRequest.bind(rail);
    vi.spyOn(rail, "createRequest").mockImplementation(async (value) => {
      const result = await create(value);
      updateDb(() => { invoice.clientEmail = "changed@example.com"; });
      return result;
    });
    const deliver = vi.spyOn(rail, "deliver");
    await expect(sendExisting(invoice.id, origin, token.id)).rejects.toThrow(/automatic retry is blocked/);
    expect(deliver).not.toHaveBeenCalled();
    expect(token.remoteReference).toBeTruthy();
    expect(invoice.status).toBe("draft");
  });

  it("durably reserves before awaiting and refuses concurrent/duplicate confirmations", async () => {
    const invoice = await issueInvoice(input);
    const token = prepareConfirmation(invoice.id, "send", origin);
    const rail = getPaypalRail();
    const createOriginal = rail.createRequest.bind(rail);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const create = vi.spyOn(rail, "createRequest").mockImplementation(async (value) => { await gate; return createOriginal(value); });
    const deliver = vi.spyOn(rail, "deliver");
    const first = sendExisting(invoice.id, origin, token.id);
    const persisted = JSON.parse(readFileSync(path.join(process.env.DATA_DIR!, "paypal-store.json"), "utf8"));
    expect(persisted.confirmations[0].state).toBe("executing");
    await expect(sendExisting(invoice.id, origin, token.id)).rejects.toThrow(/executing/);
    release(); await first;
    await expect(sendExisting(invoice.id, origin, token.id)).rejects.toThrow(/done/);
    expect(create).toHaveBeenCalledTimes(1); expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("blocks ambiguous dispatch retries, including after a module/process-style reload", async () => {
    const invoice = await issueInvoice(input);
    const token = prepareConfirmation(invoice.id, "send", origin);
    vi.spyOn(getPaypalRail(), "deliver").mockRejectedValue(new Error("Response lost after acceptance"));
    await expect(sendExisting(invoice.id, origin, token.id)).rejects.toThrow(/automatic retry is blocked/);
    expect(token.state).toBe("uncertain");
    vi.resetModules();
    const fresh = await import("./invoices");
    const confirmations = await import("./confirmations");
    await expect(fresh.sendExisting(invoice.id, origin, token.id)).rejects.toThrow(/uncertain/);
    expect(() => confirmations.prepareConfirmation(invoice.id, "send", origin)).toThrow(/review/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("invalidates edited, expired, replaced and cancelled previews", async () => {
    const invoice = await issueInvoice(input);
    const first = prepareConfirmation(invoice.id, "send", origin);
    expect(prepareConfirmation(invoice.id, "send", origin).id).toBe(first.id);
    updateDb(() => { invoice.clientEmail = "other@example.com"; });
    await expect(sendExisting(invoice.id, origin, first.id)).rejects.toThrow(/changed/);
    const replacement = prepareConfirmation(invoice.id, "send", origin);
    expect(replacement.id).not.toBe(first.id);
    updateDb(() => { replacement.expiresAt = "2000-01-01T00:00:00Z"; });
    await expect(sendExisting(invoice.id, origin, replacement.id)).rejects.toThrow(/expired/);
    const cancelled = prepareConfirmation(invoice.id, "send", origin);
    cancelConfirmation(cancelled.id);
    await expect(sendExisting(invoice.id, origin, cancelled.id)).rejects.toThrow(/cancelled/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps an interrupted executing reservation blocked after restart", async () => {
    const invoice = await issueInvoice(input);
    const token = prepareConfirmation(invoice.id, "send", origin);
    updateDb(() => { token.state = "executing"; }); // Simulate a crash at the durable reservation boundary.
    vi.resetModules();
    const fresh = await import("./invoices");
    const confirmations = await import("./confirmations");
    await expect(fresh.sendExisting(invoice.id, origin, token.id)).rejects.toThrow(/executing/);
    expect(() => confirmations.prepareConfirmation(invoice.id, "send", origin)).toThrow(/review/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses draft and paid reminder previews and a payment after preview", async () => {
    const draft = await issueInvoice(input);
    expect(() => prepareConfirmation(draft.id, "remind", origin)).toThrow(/paid or still a draft/);
    const invoice = await sentInvoice();
    const token = prepareConfirmation(invoice.id, "remind", origin);
    updateDb(() => { invoice.status = "paid"; invoice.paypalStatus = "PAID"; });
    expect(() => prepareConfirmation(invoice.id, "remind", origin)).toThrow(/paid/);
    expect((await remindInvoice(invoice.id, origin, token.id)).refusal).toMatch(/paid/);
    expect(getDb().emails).toHaveLength(0);
  });

  it("deduplicates reminders and keeps demo mail local even with a mail key", async () => {
    const invoice = await sentInvoice();
    vi.stubEnv("RESEND_API_KEY", "fake-mail-key");
    const token = prepareConfirmation(invoice.id, "remind", origin);
    const chase = vi.spyOn(getPaypalRail(), "chase");
    await remindInvoice(invoice.id, origin, token.id);
    await expect(remindInvoice(invoice.id, origin, token.id)).rejects.toThrow(/done/);
    expect(chase).toHaveBeenCalledTimes(1);
    expect(getDb().emails).toHaveLength(1);
    expect(getDb().emails[0]?.text).toBe(token.preview.message);
    expect(fetch).not.toHaveBeenCalled();
  });
});
