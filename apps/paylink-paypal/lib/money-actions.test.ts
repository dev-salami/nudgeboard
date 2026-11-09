import { beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { blankStore, updateDb } from "./store";
import { resetPaypalRail } from "./provider";
import { issueInvoice, recordInvoiceMoney, sendExisting, syncInvoice } from "./invoices";
import { prepareConfirmation, prepareMoneyConfirmation, prepareWriteoffConfirmation } from "./confirmations";

const origin = "http://localhost:3030";
const input = { amount: "40.00", date: "2026-01-01", method: "BANK_TRANSFER" as const, note: "External bank reference" };
beforeEach(() => { vi.stubEnv("DATA_DIR", mkdtempSync(path.join(tmpdir(), "paypal-money-"))); blankStore(); resetPaypalRail(); });
async function sent() {
  const invoice = await issueInvoice({ clientName: "Fictional", amount: "120", dueDate: "2026-12-01", description: "Design", asDraft: true });
  await sendExisting(invoice.id, origin, prepareConfirmation(invoice.id, "send", origin).id);
  return invoice;
}
it("records partials and refunds only after a matching separate confirmation", async () => {
  const invoice = await sent();
  const c = prepareMoneyConfirmation(invoice.id, "record-payment", input, origin);
  expect(invoice.amountReceived).toBeUndefined(); expect(c.state).toBe("pending");
  await expect(recordInvoiceMoney(invoice.id, "record-payment", origin)).rejects.toThrow(/confirm/);
  await recordInvoiceMoney(invoice.id, "record-payment", origin, c.id);
  expect(invoice).toMatchObject({ status: "underpaid", amountReceived: "40.00", recordedPaymentId: expect.stringMatching(/^DEMO-PAYMENT-/) });
  await expect(recordInvoiceMoney(invoice.id, "record-payment", origin, c.id)).rejects.toThrow(/done/);
  const refund = prepareMoneyConfirmation(invoice.id, "record-refund", { ...input, amount: "20" }, origin);
  await recordInvoiceMoney(invoice.id, "record-refund", origin, refund.id);
  expect(invoice).toMatchObject({ paypalStatus: "PARTIALLY_REFUNDED", amountRefunded: "20.00", recordedRefundId: expect.stringMatching(/^DEMO-REFUND-/) });
  expect(() => prepareWriteoffConfirmation(invoice.id, origin)).toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["PAID", "DRAFT", "CANCELLED", "REFUNDED", "PAYMENT_PENDING"])("refuses recording payment and cancel against %s", async (paypalStatus) => {
  const invoice = await sent(); updateDb(() => { invoice.paypalStatus = paypalStatus; });
  expect(() => prepareMoneyConfirmation(invoice.id, "record-payment", input, origin)).toThrow();
  expect(() => prepareWriteoffConfirmation(invoice.id, origin)).toThrow();
});
it("invalidates amount changes, refuses overpayments and unpaid refunds", async () => {
  const invoice = await sent();
  expect(() => prepareMoneyConfirmation(invoice.id, "record-payment", { ...input, amount: "121" }, origin)).toThrow(/exceeds/);
  expect(() => prepareMoneyConfirmation(invoice.id, "record-refund", input, origin)).toThrow(/refundable/);
  const c = prepareMoneyConfirmation(invoice.id, "record-payment", input, origin);
  updateDb(() => { invoice.amount = "130.00"; });
  await expect(recordInvoiceMoney(invoice.id, "record-payment", origin, c.id)).rejects.toThrow(/changed/);
});
it("GET sync applies partial amounts to the ledger", async () => {
  const invoice = await sent();
  const { getPaypalRail } = await import("./provider");
  await getPaypalRail().client.recordPayment(invoice.payment!.reference, input);
  await syncInvoice(invoice.id);
  expect(invoice).toMatchObject({ status: "underpaid", amountReceived: "40.00" });
});
