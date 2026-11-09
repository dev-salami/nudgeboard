import { paypalAmount } from "./money";
import { PRODUCT_NAME } from "./brand";
import { judgeDemoInvoices } from "./judge-demo-seed";
import { paypalInvoiceId, splitName } from "./names";

export interface PaypalDraftInput {
  invoiceNumber: string;
  localId: string;
  amount: string;
  description: string;
  dueDate: string;
  invoiceDate: string;
  clientName: string;
  clientEmail?: string;
  merchantName: string;
  merchantEmail: string;
  note?: string;
  payUrl?: string;
}

export interface PaypalRemoteInvoice {
  id: string;
  status: string;
  recipientViewUrl?: string;
  invoicerViewUrl?: string;
  transactionId?: string;
  amountPaid?: string;
}

export interface PaypalWebhookHeaders {
  authAlgo?: string;
  certUrl?: string;
  transmissionId?: string;
  transmissionSig?: string;
  transmissionTime?: string;
}

export interface PaypalTransport {
  mode: "demo" | "sandbox";
  createDraft(input: PaypalDraftInput): Promise<PaypalRemoteInvoice>;
  send(id: string, note?: string): Promise<PaypalRemoteInvoice>;
  get(id: string): Promise<PaypalRemoteInvoice>;
  remind(id: string, note: string): Promise<void>;
  cancel(id: string, note: string): Promise<void>;
  verifyWebhook(event: unknown, headers: PaypalWebhookHeaders): Promise<{ ok: boolean; reason: string }>;
  simulatePayment?(id: string, transactionId: string, amount: string): void;
}

export interface PaypalClientOptions {
  mode: "demo" | "sandbox";
  clientId?: string;
  clientSecret?: string;
  webhookId?: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
}

interface DemoRecord extends PaypalRemoteInvoice {
  input?: PaypalDraftInput;
}

export function createPaypalClient(options: PaypalClientOptions): PaypalTransport {
  if (options.mode === "demo") return createDemoClient();
  return createSandboxClient(options);
}

function createDemoClient(): PaypalTransport {
  const records = new Map<string, DemoRecord>();
  for (const invoice of judgeDemoInvoices()) records.set(invoice.payment!.reference, {
    id: invoice.payment!.reference, status: invoice.paypalStatus!, amountPaid: invoice.amountReceived, transactionId: invoice.txSignature,
    input: { invoiceNumber: invoice.number, localId: invoice.id, amount: invoice.amount, description: invoice.description, dueDate: invoice.dueDate,
      invoiceDate: invoice.createdAt.slice(0, 10), clientName: invoice.clientName, merchantName: "Demo Studio", merchantEmail: "merchant@studio.example" },
  });

  function must(id: string): DemoRecord {
    const found = records.get(id);
    if (!found) throw new Error(`No demo PayPal invoice ${id}.`);
    return found;
  }

  return {
    mode: "demo",
    async createDraft(input) {
      const id = paypalInvoiceId();
      const record: DemoRecord = {
        id,
        status: "DRAFT",
        recipientViewUrl: input.payUrl,
        input,
      };
      records.set(id, record);
      return publicView(record);
    },
    async send(id) {
      const record = must(id);
      record.status = "SENT";
      if (record.input?.payUrl) record.recipientViewUrl = record.input.payUrl;
      return publicView(record);
    },
    async get(id) {
      return publicView(must(id));
    },
    async remind(id) {
      const record = must(id);
      if (record.status === "PAID" || record.status === "CANCELLED") {
        throw new Error(`PayPal will not remind a ${record.status} invoice.`);
      }
      if (record.status === "DRAFT") record.status = "SENT";
    },
    async verifyWebhook(event) {
      const parsed = readWebhook(event);
      if (!parsed) return { ok: false, reason: "Demo webhook needs an INVOICING.INVOICE event with an invoice id." };
      return { ok: true, reason: "Demo mode accepts well-formed invoicing events without a PayPal signature." };
    },
    async cancel(id) {
      const record = must(id);
      if (!["SENT", "UNPAID", "PARTIALLY_PAID"].includes(record.status)) throw new Error("Invoice cannot be cancelled.");
      record.status = "CANCELLED";
    },
    simulatePayment(id, transactionId, amount) {
      const record = must(id);
      record.status = "PAID";
      record.transactionId = transactionId;
      record.amountPaid = amount;
    },
  };
}

function createSandboxClient(options: PaypalClientOptions): PaypalTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBase = (options.apiBase ?? "https://api-m.sandbox.paypal.com").replace(/\/$/, "");
  if (apiBase !== "https://api-m.sandbox.paypal.com") throw new Error("Only the PayPal sandbox API host is allowed.");
  const clientId = options.clientId ?? "";
  const clientSecret = options.clientSecret ?? "";
  const webhookId = options.webhookId ?? "";
  let cache: { token: string; expiresAt: number } | null = null;
  let pendingToken: Promise<string> | null = null;

  async function token(): Promise<string> {
    if (cache && cache.expiresAt > Date.now() + 15_000) return cache.token;
    if (!pendingToken) pendingToken = fetchToken().finally(() => { pendingToken = null; });
    return pendingToken;
  }

  async function fetchToken(): Promise<string> {
    if (!clientId || !clientSecret) throw new Error("PayPal sandbox requires both REST credentials.");
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetchImpl(`${apiBase}/v1/oauth2/token`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const json = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!response.ok || !json.access_token || !Number.isFinite(json.expires_in) || Number(json.expires_in) <= 0) {
      throw new Error(json.error_description || `PayPal OAuth failed (${response.status}).`);
    }
    cache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 300) * 1000 };
    return json.access_token;
  }

  async function call(path: string, init: RequestInit = {}, retry = true): Promise<{ status: number; json: unknown }> {
    const access = await token();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${access}`);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetchImpl(`${apiBase}${path}`, { ...init, headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
    const text = await response.text();
    const json = text ? safeJson(text) : {};
    if (response.status === 401 && retry) {
      if (cache?.token === access) cache = null;
      return call(path, init, false);
    }
    if (!response.ok) throw new Error(paypalError(json, response.status));
    return { status: response.status, json };
  }

  return {
    mode: "sandbox",
    async createDraft(input) {
      const { json } = await call("/v2/invoicing/invoices", {
        method: "POST",
        headers: { Prefer: "return=representation", "PayPal-Request-Id": `draft-${input.localId}` },
        body: JSON.stringify(buildDraftBody(input)),
      });
      return readInvoice(json);
    },
    async send(id, note) {
      await call(`/v2/invoicing/invoices/${encodeURIComponent(id)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "PayPal-Request-Id": `send-${id}` },
        body: JSON.stringify({
          send_to_recipient: true,
          send_to_invoicer: false,
          subject: `Invoice from ${PRODUCT_NAME}`,
          note: note || "Please pay this invoice.",
        }),
      });
      return this.get(id);
    },
    async get(id) {
      const { json } = await call(`/v2/invoicing/invoices/${encodeURIComponent(id)}`, { method: "GET" });
      return readInvoice(json);
    },
    async remind(id, note) {
      await call(`/v2/invoicing/invoices/${encodeURIComponent(id)}/remind`, {
        method: "POST",
        body: JSON.stringify({
          subject: "Reminder: this invoice is still open",
          note,
          send_to_recipient: true,
          send_to_invoicer: false,
        }),
      });
    },
    async verifyWebhook(event, headers) {
      if (!webhookId) {
        return { ok: false, reason: "PAYPAL_WEBHOOK_ID is unset, so this event was not applied. Sync the invoice instead." };
      }
      if (!headers.transmissionId || !headers.transmissionSig || !headers.transmissionTime || !headers.certUrl || !headers.authAlgo) {
        return { ok: false, reason: "PayPal transmission headers are missing." };
      }
      const { json } = await call("/v1/notifications/verify-webhook-signature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_algo: headers.authAlgo,
          cert_url: headers.certUrl,
          transmission_id: headers.transmissionId,
          transmission_sig: headers.transmissionSig,
          transmission_time: headers.transmissionTime,
          webhook_id: webhookId,
          webhook_event: event,
        }),
      });
      if (asRecord(json).verification_status !== "SUCCESS") return { ok: false, reason: "PayPal rejected the webhook signature." };
      return { ok: true, reason: "PayPal verified the webhook signature." };
    },
    async cancel(id, note) {
      await call(`/v2/invoicing/invoices/${encodeURIComponent(id)}/cancel`, {
        method: "POST", body: JSON.stringify({ note, send_to_recipient: true, send_to_invoicer: false }),
      });
    },
  };
}

export function buildDraftBody(input: PaypalDraftInput): Record<string, unknown> {
  const value = paypalAmount(input.amount);
  const recipient = splitName(input.clientName);
  const merchant = splitName(input.merchantName);
  const body: Record<string, unknown> = {
    detail: {
      invoice_number: input.invoiceNumber,
      reference: input.localId,
      invoice_date: input.invoiceDate,
      currency_code: "USD",
      note: input.note || `Sent by ${PRODUCT_NAME}.`,
      payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: input.dueDate },
    },
    invoicer: {
      name: merchant,
      email_address: input.merchantEmail,
    },
    items: [
      {
        name: input.description.slice(0, 200) || "Services",
        description: input.description,
        quantity: "1",
        unit_amount: { currency_code: "USD", value },
      },
    ],
  };
  if (input.clientEmail) {
    body.primary_recipients = [
      {
        billing_info: {
          name: recipient,
          email_address: input.clientEmail,
        },
      },
    ];
  }
  return body;
}

export function readInvoice(json: unknown): PaypalRemoteInvoice {
  const record = asRecord(json);
  const id = stringField(record, "id") || idFromLinks(record);
  if (!id) throw new Error("PayPal did not return an invoice id.");
  const detail = asRecord(record.detail);
  const metadata = asRecord(detail.metadata);
  const payments = asRecord(record.payments);
  const transactions = Array.isArray(payments.transactions) ? payments.transactions : [];
  const paid = transactions.map(asRecord).find((item) => stringField(item, "transaction_id"));
  const paidAmount = asRecord(payments.paid_amount ?? paid?.amount);
  return {
    id,
    status: stringField(record, "status") || "DRAFT",
    recipientViewUrl: sandboxViewUrl(stringField(metadata, "recipient_view_url")),
    invoicerViewUrl: sandboxViewUrl(stringField(metadata, "invoicer_view_url")),
    transactionId: paid ? stringField(paid, "transaction_id") || undefined : undefined,
    amountPaid: stringField(paidAmount, "value") || undefined,
  };
}

function sandboxViewUrl(value: string): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "www.sandbox.paypal.com" || url.port || url.username || url.password) {
    throw new Error("PayPal returned a non-sandbox invoice link.");
  }
  return value;
}

export function readWebhook(event: unknown): { id?: string; eventType: string; invoiceId: string; status?: string; transactionId?: string; amount?: string } | null {
  const record = asRecord(event);
  const eventType = stringField(record, "event_type");
  if (!eventType.startsWith("INVOICING.INVOICE.")) return null;
  const resource = asRecord(record.resource);
  const nested = asRecord(resource.invoice);
  const invoiceId = stringField(nested, "id") || stringField(resource, "id");
  if (!invoiceId) return null;
  const payments = asRecord(nested.payments ?? resource.payments);
  const transactions = Array.isArray(payments.transactions) ? payments.transactions : [];
  const paid = transactions.map(asRecord).find((item) => stringField(item, "transaction_id"));
  const paidAmount = asRecord(payments.paid_amount ?? paid?.amount);
  return {
    id: stringField(record, "id") || undefined,
    eventType,
    invoiceId,
    status: stringField(nested, "status") || stringField(resource, "status") || undefined,
    transactionId: paid ? stringField(paid, "transaction_id") || undefined : undefined,
    amount: stringField(paidAmount, "value") || undefined,
  };
}

export function webhookHeaders(headers: Headers): PaypalWebhookHeaders {
  return {
    authAlgo: headers.get("paypal-auth-algo") ?? undefined,
    certUrl: headers.get("paypal-cert-url") ?? undefined,
    transmissionId: headers.get("paypal-transmission-id") ?? undefined,
    transmissionSig: headers.get("paypal-transmission-sig") ?? undefined,
    transmissionTime: headers.get("paypal-transmission-time") ?? undefined,
  };
}

function publicView(record: DemoRecord): PaypalRemoteInvoice {
  return {
    id: record.id,
    status: record.status,
    recipientViewUrl: record.recipientViewUrl,
    invoicerViewUrl: record.invoicerViewUrl,
    transactionId: record.transactionId,
    amountPaid: record.amountPaid,
  };
}

function idFromLinks(record: Record<string, unknown>): string {
  const direct = stringField(record, "href");
  const links = Array.isArray(record.links) ? record.links.map(asRecord) : [];
  const self = links.find((link) => stringField(link, "rel") === "self");
  const candidate = direct || (self ? stringField(self, "href") : "");
  const match = candidate.match(/\/invoices\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function paypalError(json: unknown, status: number): string {
  const record = asRecord(json);
  const details = Array.isArray(record.details) ? record.details.map(asRecord) : [];
  const detail = details[0] ? stringField(details[0], "description") || stringField(details[0], "issue") : "";
  const message = stringField(record, "message") || stringField(record, "error_description");
  return [message || `PayPal request failed (${status}).`, detail].filter(Boolean).join(" ");
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 180) };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringField(record: Record<string, unknown> | undefined, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}
