import { describe, expect, it } from "vitest";
import type { CreatePaymentInput, PaymentProvider } from "@181hacks/paylink-core";
import { createPaypalClient } from "./paypal-client";
import { createPaypalRail } from "./provider";

function input(amount = "220"): CreatePaymentInput {
  return {
    invoiceId: "inv_provider",
    amount,
    currency: "USDC",
    label: "PP-2026-1042",
    message: "Homepage",
    memo: "2026-12-01",
    invoiceNumber: "PP-2026-1042",
    clientName: "Northwind",
    clientEmail: "ap@northwind.example",
    description: "Homepage",
    dueDate: "2026-12-01",
    invoiceDate: "2026-11-05",
    merchantName: "Amaka Studio",
    merchantEmail: "amaka@amaka.studio",
    payUrl: "http://localhost:3030/pay/inv_provider",
  } as CreatePaymentInput;
}

describe("PayPal PaymentProvider", () => {
  it("issues a USD pay link and reports paid after a simulated capture", async () => {
    const client = createPaypalClient({ mode: "demo" });
    const rail = createPaypalRail(client);
    const provider: PaymentProvider = rail;
    const created = await provider.createRequest(input());
    expect(rail.id).toBe("paypal");
    expect(created.asset).toBe("USD");
    expect(created.network).toBe("paypal-demo");
    expect(created.reference).toMatch(/^DEMO-INV2-/);
    expect(created.url).toBe("http://localhost:3030/pay/inv_provider");

    const open = await provider.check({
      reference: created.reference,
      amount: "220",
      asset: "USD",
      recipient: created.recipient,
      dueDate: "2026-12-01",
    });
    expect(open.status).toBe("pending");

    client.simulatePayment?.(created.reference, "TX-220", "220.00");
    const paid = await provider.check({
      reference: created.reference,
      amount: "220",
      asset: "USD",
      recipient: created.recipient,
      dueDate: "2026-12-01",
    });
    expect(paid.status).toBe("paid");
    expect(paid.signature).toBe("TX-220");
  });

  it("keeps a short capture as underpaid", async () => {
    const client = createPaypalClient({ mode: "demo" });
    const rail = createPaypalRail(client);
    const created = await rail.createRequest(input("80"));
    client.simulatePayment?.(created.reference, "TX-SHORT", "10.00");
    const result = await rail.check({
      reference: created.reference,
      amount: "80",
      asset: "USD",
      recipient: created.recipient,
      dueDate: "2026-12-01",
    });
    expect(result.status).toBe("underpaid");
  });
});
