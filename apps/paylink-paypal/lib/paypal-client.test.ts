import { describe, expect, it, vi } from "vitest";
import { buildDraftBody, createPaypalClient, readInvoice, readWebhook } from "./paypal-client";

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
  it("rejects live/custom hosts before making a request", () => {
    for (const apiBase of ["https://api-m.paypal.com", "https://example.com", "https://api-m.sandbox.paypal.com@evil.test"]) {
      expect(() => createPaypalClient({ mode: "sandbox", apiBase })).toThrow(/sandbox/);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shares a cached token, refreshes at expiry, and retries a rejected token once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T00:00:00Z"));
    let tokens = 0;
    let reject = false;
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toMatch(/^https:\/\/api-m\.sandbox\.paypal\.com\//);
      expect(init?.redirect).toBe("error");
      if (String(url).endsWith("/token")) return Response.json({ access_token: `token-${++tokens}`, expires_in: 60 });
      if (reject) { reject = false; return Response.json({ message: "Expired token" }, { status: 401 }); }
      return Response.json({ id: "INV2-CACHE", status: "SENT" });
    });
    const client = createPaypalClient({ mode: "sandbox", clientId: "fake-id", clientSecret: "fake-secret", fetchImpl });
    await Promise.all([client.get("INV2-CACHE"), client.get("INV2-CACHE")]);
    expect(tokens).toBe(1);
    vi.setSystemTime(new Date("2026-11-07T00:01:01Z"));
    await client.get("INV2-CACHE");
    expect(tokens).toBe(2);
    reject = true;
    await client.get("INV2-CACHE");
    expect(tokens).toBe(3);
  });

  it("surfaces OAuth, validation, rate-limit, and unavailable errors without demo fallback", async () => {
    const failedOauth = createPaypalClient({ mode: "sandbox", clientId: "fake", clientSecret: "fake", fetchImpl: async () => Response.json({ error_description: "Invalid sandbox credentials" }, { status: 401 }) });
    await expect(failedOauth.createDraft(draft)).rejects.toThrow("Invalid sandbox credentials");
    for (const status of [401, 422, 429, 503]) {
      const fetchImpl = vi.fn<typeof fetch>(async (url) => String(url).endsWith("/token")
        ? Response.json({ access_token: "fake-token", expires_in: 300 })
        : Response.json({ message: "Sandbox failure", details: [{ issue: "TEST_ERROR" }] }, { status }));
      const client = createPaypalClient({ mode: "sandbox", clientId: "fake", clientSecret: "fake", fetchImpl });
      await expect(client.createDraft(draft)).rejects.toThrow(/Sandbox failure.*TEST_ERROR/);
      expect(fetchImpl).toHaveBeenCalledTimes(status === 401 ? 4 : 2);
    }
  });

  it("creates a draft, sends it, gets its payer link, then reads payment", async () => {
    const calls: string[] = [];
    let paid = false;
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push(`${init?.method} ${new URL(String(url)).pathname}`);
      if (String(url).endsWith("/token")) return Response.json({ access_token: "fake", expires_in: 300 });
      if (String(url).endsWith("/invoices")) {
        expect(new Headers(init?.headers).get("PayPal-Request-Id")).toBe("draft-inv_test");
        expect(JSON.parse(String(init?.body)).detail.payment_term.due_date).toBe(draft.dueDate);
        return Response.json({ href: "https://api-m.sandbox.paypal.com/v2/invoicing/invoices/INV2-LIFE" }, { status: 201 });
      }
      if (String(url).endsWith("/send")) return new Response(null, { status: 202 });
      return Response.json({ id: "INV2-LIFE", status: paid ? "PAID" : "SENT", detail: { metadata: { recipient_view_url: "https://www.sandbox.paypal.com/invoice/p/#INV2-LIFE" } }, payments: paid ? { paid_amount: { currency_code: "USD", value: "150.00" }, transactions: [{ transaction_id: "TX-LIFE", amount: { value: "50.00" } }] } : undefined });
    };
    const client = createPaypalClient({ mode: "sandbox", clientId: "fake", clientSecret: "fake", fetchImpl });
    const created = await client.createDraft(draft);
    expect(created.id).toBe("INV2-LIFE");
    const sent = await client.send(created.id);
    expect(sent.status).toBe("SENT");
    expect(sent.recipientViewUrl).toContain("www.sandbox.paypal.com");
    paid = true;
    expect(await client.get(created.id)).toMatchObject({ status: "PAID", transactionId: "TX-LIFE", amountPaid: "150.00" });
    expect(calls).toEqual(["POST /v1/oauth2/token", "POST /v2/invoicing/invoices", "POST /v2/invoicing/invoices/INV2-LIFE/send", "GET /v2/invoicing/invoices/INV2-LIFE", "GET /v2/invoicing/invoices/INV2-LIFE"]);
  });

  it("rejects non-sandbox payer links", () => {
    expect(() => readInvoice({ id: "INV2-LIVE", detail: { metadata: { recipient_view_url: "https://www.paypal.com/invoice/p/test" } } })).toThrow(/non-sandbox/);
  });

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
