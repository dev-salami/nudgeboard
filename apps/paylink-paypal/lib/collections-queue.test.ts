import { beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectionsQueue, proposeCollectionAction } from "./collections-queue";
import { blankStore, getDb, updateDb } from "./store";
import { resetPaypalRail } from "./provider";
import { issueInvoice, sendExisting } from "./invoices";
import { prepareConfirmation } from "./confirmations";
import { POST as approve } from "../app/api/collections/route";
import { POST as confirm } from "../app/api/confirmations/[id]/route";
import type { PaypalInvoice } from "./types";

const origin = "http://localhost:3030";
const now = new Date("2026-11-09T12:00:00Z");
function row(id: string, dueDate: string, amount = "120.00"): PaypalInvoice {
  return { id, number: id, clientName: id, amount, currency: "USD", description: "Design", dueDate, status: "pending", createdAt: now.toISOString(), updatedAt: now.toISOString() };
}
beforeEach(() => {
  vi.stubEnv("DATA_DIR", mkdtempSync(path.join(tmpdir(), "paypal-queue-")));
  blankStore(); resetPaypalRail();
});
it("ranks overdue descending then remaining balance descending", () => {
  const partial = { ...row("partial", "2026-11-01", "500"), amountReceived: "450" };
  expect(collectionsQueue([partial, row("new", "2026-11-08"), row("large", "2026-11-01", "200"), row("old", "2026-10-01")], now).map((r) => r.invoiceId)).toEqual(["old", "large", "partial", "new"]);
});
it("keeps writeoff thresholds and firm escalation in one policy", () => {
  expect(proposeCollectionAction(row("tiny", "2026-09-25", "12"), [], now)).toMatchObject({ action: "writeoff", reason: "No payment in 45 days; balance 12.00 USD — propose write-off" });
  expect(proposeCollectionAction(row("large", "2026-10-01", "2000"), [], now)).toMatchObject({ action: "escalate", tone: "firm" });
  expect(proposeCollectionAction(row("new", "2026-11-05"), [], now)).toMatchObject({ action: "remind", tone: "friendly", reason: "First reminder; due 4 days ago" });
});
it.each(["PAID", "DRAFT", "CANCELLED", "REFUNDED", "PAYMENT_PENDING"])("omits %s proposals", (paypalStatus) => {
  expect(collectionsQueue([{ ...row("x", "2026-11-01"), paypalStatus }], now)).toEqual([]);
});
it("approval is local; only matching explicit JSON confirmation dispatches and repeats do not", async () => {
  const invoice = await issueInvoice({ clientName: "Fictional", amount: "12", description: "Design", dueDate: "2020-01-01", asDraft: true });
  await sendExisting(invoice.id, origin, prepareConfirmation(invoice.id, "send", origin).id);
  const response = await approve(new Request(`${origin}/api/collections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceIds: [invoice.id] }) }));
  const data = await response.json();
  const c = data.results[0].confirmation;
  expect(c.state).toBe("pending"); expect(invoice.paypalStatus).toBe("SENT"); expect(fetch).not.toHaveBeenCalled();
  const context = { params: Promise.resolve({ id: c.id }) };
  const request = (body: unknown, type = "application/json") => new Request(`${origin}/api/confirmations/${c.id}`, { method: "POST", headers: { "Content-Type": type }, body: JSON.stringify(body) });
  expect((await confirm(request("yes", "text/plain"), context)).status).toBe(403);
  expect((await confirm(request({ decision: "confirm", invoiceId: "wrong", action: c.action }), context)).status).toBe(400);
  const body = { decision: "confirm", invoiceId: invoice.id, action: c.action };
  expect((await confirm(request(body), context)).status).toBe(200);
  expect(invoice.paypalStatus).toBe("CANCELLED");
  expect((await (await confirm(request(body), context)).json()).message).toMatch(/Already completed/);
  expect(getDb().confirmations.find((r) => r.id === c.id)?.state).toBe("done");
});
it("a changed snapshot refuses dispatch", async () => {
  const invoice = await issueInvoice({ clientName: "Fictional", amount: "12", description: "Design", dueDate: "2020-01-01", asDraft: true });
  await sendExisting(invoice.id, origin, prepareConfirmation(invoice.id, "send", origin).id);
  const { prepareWriteoffConfirmation } = await import("./confirmations");
  const { writeoffInvoice } = await import("./invoices");
  const c = prepareWriteoffConfirmation(invoice.id, origin);
  updateDb(() => { invoice.amountReceived = "1"; });
  await expect(writeoffInvoice(invoice.id, origin, c.id)).rejects.toThrow(/changed/);
});
