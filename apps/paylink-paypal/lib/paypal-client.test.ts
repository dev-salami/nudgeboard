import { describe, expect, it } from "vitest";
import { buildDraftBody, createPaypalClient, readWebhook } from "./paypal-client";

const draft = {
  invoiceNumber: "PP-2026-1041",
  localId: "inv_test",
  amount: "150",
  description: "Logo design",
  dueDate: "2026-11-12",
  invoiceDate: "2026-11-05",
  clientName: "Ada Lovelace",
  clientEmail: "ada@example.com",
  merchantName: "Amaka Studio",
  merchantEmail: "amaka@amaka.studio",
  payUrl: "http://localhost:3030/pay/inv_test",
};

describe("PayPal demo client", () => {
  it("creates, sends, reminds, and simulates a payment without credentials", async () => {
    const client = createPaypalClient({ mode: "demo" });
    const created = await client.createDraft(draft);
    expect(created.id).toMatch(/^DEMO-INV2-/);
    expect(created.status).toBe("DRAFT");
    const sent = await client.send(created.id);
    expect(sent.status).toBe("SENT");
    expect(sent.recipientViewUrl).toBe(draft.payUrl);
    await client.remind(created.id, "Please pay");
    client.simulatePayment?.(created.id, "DEMO-TX", "150.00");
    const paid = await client.get(created.id);
    expect(paid.status).toBe("PAID");
    expect(paid.transactionId).toBe("DEMO-TX");
    const verification = await client.verifyWebhook({
      id: "WH-1",
      event_type: "INVOICING.INVOICE.PAID",
      resource: { invoice: { id: created.id, status: "PAID" } },
    }, {});
    expect(verification.ok).toBe(true);
    const rejected = await client.verifyWebhook({ event_type: "CHECKOUT.ORDER.APPROVED" }, {});
    expect(rejected.ok).toBe(false);
  });
});

describe("PayPal sandbox client", () => {
  it("gets an OAuth token and posts a USD invoice", async () => {
    const calls: { url: string; authorization?: string; body?: string }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(url), authorization: headers.get("authorization") ?? undefined, body: typeof init?.body === "string" ? init.body : undefined });
      if (String(url).endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok_test", expires_in: 300 }));
      }
      if (String(url).endsWith("/v2/invoicing/invoices")) {
        return new Response(JSON.stringify({
          id: "INV2-SANDBOX",
          status: "DRAFT",
          detail: { metadata: { recipient_view_url: "https://www.sandbox.paypal.com/invoice/p/#INV2-SANDBOX" } },
        }), { status: 201 });
      }
      return new Response("missing", { status: 404 });
    };
    const client = createPaypalClient({
      mode: "sandbox",
      clientId: "client-id",
      clientSecret: "client-secret",
      apiBase: "https://api-m.sandbox.paypal.com",
      fetchImpl,
    });
    const created = await client.createDraft(draft);
    expect(created.id).toBe("INV2-SANDBOX");
    expect(created.recipientViewUrl).toContain("sandbox.paypal.com");
    expect(calls[0]?.url).toContain("/v1/oauth2/token");
    expect(calls[0]?.authorization).toBe(`Basic ${Buffer.from("client-id:client-secret").toString("base64")}`);
    expect(calls[1]?.authorization).toBe("Bearer tok_test");
    expect(calls[1]?.body).toContain('"currency_code":"USD"');
    expect(calls[1]?.body).toContain("150.00");
    expect(calls[1]?.body).not.toContain("client-secret");
  });

  it("verifies a webhook only when PayPal says SUCCESS", async () => {
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 300 }));
      if (String(url).includes("verify-webhook-signature")) return new Response(JSON.stringify({ verification_status: "FAILURE" }));
      return new Response("no", { status: 404 });
    };
    const client = createPaypalClient({
      mode: "sandbox",
      clientId: "id",
      clientSecret: "secret",
      webhookId: "WH-ID",
      fetchImpl,
    });
    const headers = {
      authAlgo: "SHA256withRSA",
      certUrl: "https://api.sandbox.paypal.com/cert.pem",
      transmissionId: "tid",
      transmissionSig: "sig",
      transmissionTime: "2026-11-05T00:00:00Z",
    };
    const failed = await client.verifyWebhook({ event_type: "INVOICING.INVOICE.PAID" }, headers);
    expect(failed.ok).toBe(false);
    const missing = await createPaypalClient({ mode: "sandbox", clientId: "id", clientSecret: "secret", fetchImpl }).verifyWebhook({}, headers);
    expect(missing.ok).toBe(false);
    expect(missing.reason).toMatch(/PAYPAL_WEBHOOK_ID/);
  });
});

describe("invoice payload", () => {
  it("builds a PayPal invoicing body and reads webhook ids", () => {
    const body = buildDraftBody(draft);
    expect(JSON.stringify(body)).toContain("ada@example.com");
    expect(JSON.stringify(body)).toContain("DUE_ON_DATE_SPECIFIED");
    const parsed = readWebhook({
      id: "WH-2",
      event_type: "INVOICING.INVOICE.PAID",
      resource: { invoice: { id: "INV2-1", status: "PAID", payments: { transactions: [{ transaction_id: "TX9", amount: { currency_code: "USD", value: "150.00" } }] } } },
    });
    expect(parsed?.invoiceId).toBe("INV2-1");
    expect(parsed?.transactionId).toBe("TX9");
    expect(parsed?.amount).toBe("150.00");
  });
});
