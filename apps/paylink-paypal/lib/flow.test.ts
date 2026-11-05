import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyWebhook, completeDemoPayment, findInvoice, issueInvoice, remindInvoice, unpaidInvoices } from "./invoices";
import { getPaypalRail, resetPaypalRail } from "./provider";
import { blankStore, getDb } from "./store";

beforeEach(() => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "paylink-paypal-"));
  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_SECRET;
  resetPaypalRail();
  blankStore();
});

afterEach(() => {
  resetPaypalRail();
});

describe("demo collections loop", () => {
  it("drafts through the agent tools, pays on the demo rail, and updates the merchant book", async () => {
    const invoice = await issueInvoice({
      clientName: "Ada Lovelace",
      clientEmail: "ada@example.com",
      description: "Spring logo",
      amount: "480",
      dueDate: "2026-11-12",
      asDraft: false,
      origin: "http://localhost:3030",
    });
    expect(invoice.status).toBe("pending");
    expect(invoice.payment?.network).toBe("paypal-demo");
    expect(invoice.payment?.url).toBe(`http://localhost:3030/pay/${invoice.id}`);
    expect(unpaidInvoices().some((item) => item.id === invoice.id)).toBe(true);

    const paid = completeDemoPayment(invoice.id, "card");
    expect(paid.status).toBe("paid");
    expect(paid.paidVia).toBe("card");
    expect(paid.receiptId).toBeTruthy();
    expect(getDb().receipts[0]?.invoiceId).toBe(invoice.id);
    expect(completeDemoPayment(invoice.id).receiptId).toBe(paid.receiptId);
    expect(unpaidInvoices().some((item) => item.id === invoice.id)).toBe(false);

    const open = await issueInvoice({
      clientName: "Mina",
      clientEmail: "mina@example.com",
      description: "Homepage",
      amount: "90",
      dueDate: "2026-11-20",
      asDraft: false,
      origin: "http://localhost:3030",
    });
    const reminded = await remindInvoice("Mina", "http://localhost:3030");
    expect(reminded.refusal).toBeUndefined();
    expect(getDb().emails[0]?.to).toBe("mina@example.com");
    expect(getDb().emails[0]?.text).toContain(open.number);

    const refused = await remindInvoice(invoice.number);
    expect(refused.refusal).toMatch(/already paid/);

    const event = {
      id: "WH-DEMO-1",
      event_type: "INVOICING.INVOICE.PAID",
      resource: {
        invoice: {
          id: open.payment?.reference,
          status: "PAID",
          payments: { transactions: [{ transaction_id: "TX-MINA", amount: { value: "90.00" } }] },
        },
      },
    };
    expect((await getPaypalRail().verify(event, {})).ok).toBe(true);
    const applied = applyWebhook(event);
    expect(applied.ok).toBe(true);
    expect(findInvoice(open.id)?.status).toBe("paid");
    expect(findInvoice(open.id)?.txSignature).toBe("TX-MINA");
    expect(applyWebhook(event).duplicate).toBe(true);
  });
});
