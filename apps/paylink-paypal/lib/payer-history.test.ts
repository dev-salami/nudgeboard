import { expect, it } from "vitest";
import { judgeDemoInvoices } from "./judge-demo-seed";
import { proposeCollectionAction } from "./collections-queue";
import { payerHistory } from "./payer-history";

const now = new Date("2026-11-09T12:00:00Z");
const rows = judgeDemoInvoices(now);
const proposal = (id: string) => proposeCollectionAction(rows.find((r) => r.id === `inv_demo_${id}`)!, rows, now);
it("computes late history from three actual paid records", () => {
  expect(proposal("harbour_open")).toMatchObject({ action: "escalate", tone: "firm", reason: "Paid 9 days late the last 3 times" });
  const invoice = rows.find((r) => r.id === "inv_demo_harbour_open")!;
  const changed = rows.map((r) => r.clientName === "Harbour" && r.paidAt ? { ...r, paidAt: r.dueDate } : r);
  expect(payerHistory(invoice, changed).lateCount).toBe(0);
  expect(proposeCollectionAction({ ...invoice, amount: "100" }, changed, now).action).toBe("remind");
});
it("varies first chase, repeated chase, partial and writeoff reasons", () => {
  expect(proposal("northwind")).toMatchObject({ action: "remind", tone: "friendly", reason: "First reminder; due 4 days ago" });
  expect(proposal("summit")).toMatchObject({ action: "escalate", tone: "firm", reason: "Already reminded; still unpaid after 32 days" });
  expect(proposal("partial")).toMatchObject({ action: "remind", tone: "empathetic", reason: "Partial payment of 40.00 USD received; 80.00 USD remains" });
  expect(proposal("small")).toMatchObject({ action: "writeoff", reason: "No payment in 45 days; balance 12.00 USD — propose write-off" });
});
it("does not write off recent partial movement, and escalates a repeated partial", () => {
  const tiny = rows.find((r) => r.id === "inv_demo_small")!;
  expect(proposeCollectionAction({ ...tiny, amountReceived: "1", lastPaymentAt: "2026-11-08" }, rows, now).action).toBe("remind");
  const partial = rows.find((r) => r.id === "inv_demo_partial")!;
  expect(proposeCollectionAction({ ...partial, dueDate: "2026-10-01", lastRemindedAt: "2026-10-15" }, rows, now)).toMatchObject({ action: "escalate", tone: "firm" });
});
it("never borrows another email identity's history", () => {
  const invoice = rows.find((r) => r.id === "inv_demo_harbour_open")!;
  expect(payerHistory({ ...invoice, clientEmail: "other@harbour.example" }, rows).count).toBe(0);
});
