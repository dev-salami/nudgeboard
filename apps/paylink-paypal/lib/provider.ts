import {
  classifyInvoiceObservation,
  isPastDue,
  type CreatePaymentInput,
  type PaymentCheckInput,
  type PaymentCheckResult,
  type PaymentProvider,
  type PaymentRequestResult,
} from "@181hacks/paylink-core";
import { paypalApiBase, paypalMode, env } from "./env";
import { compareUsd, paypalAmount } from "./money";
import {
  createPaypalClient,
  type PaypalDraftInput,
  type PaypalRemoteInvoice,
  type PaypalTransport,
  type PaypalWebhookHeaders,
} from "./paypal-client";

/**
 * Core types the request currency as USDC because that was the first rail.
 * PayPal settles the same decimal amount in USD. The extra payer fields ride
 * along at runtime; they are not added to `packages/paylink-core`.
 */
export interface PaypalIssueFields {
  invoiceNumber: string;
  clientName: string;
  clientEmail?: string;
  description: string;
  dueDate: string;
  invoiceDate: string;
  merchantName: string;
  merchantEmail: string;
  payUrl: string;
  note?: string;
}

export interface PaypalRail extends PaymentProvider {
  client: PaypalTransport;
  deliver(reference: string, note?: string): Promise<PaypalRemoteInvoice>;
  chase(reference: string, note: string): Promise<void>;
  lookup(reference: string): Promise<PaypalRemoteInvoice>;
  verify(event: unknown, headers: PaypalWebhookHeaders): Promise<{ ok: boolean; reason: string }>;
}

let cached: PaypalRail | null = null;
let cachedMode = "";

export function getPaypalRail(): PaypalRail {
  const mode = paypalMode();
  if (!cached || cachedMode !== mode) {
    cached = createPaypalRail(createPaypalClient({
      mode,
      clientId: env("PAYPAL_CLIENT_ID"),
      clientSecret: env("PAYPAL_CLIENT_SECRET"),
      webhookId: env("PAYPAL_WEBHOOK_ID"),
      apiBase: paypalApiBase(),
    }));
    cachedMode = mode;
  }
  return cached;
}

export function resetPaypalRail(): void {
  cached = null;
  cachedMode = "";
}

export function createPaypalRail(client: PaypalTransport): PaypalRail {
  return {
    id: "paypal",
    client,
    async createRequest(input: CreatePaymentInput): Promise<PaymentRequestResult> {
      const fields = input as CreatePaymentInput & Partial<PaypalIssueFields>;
      const draft: PaypalDraftInput = {
        invoiceNumber: fields.invoiceNumber || input.label,
        localId: input.invoiceId,
        amount: paypalAmount(input.amount),
        description: fields.description || input.message || input.label,
        dueDate: fields.dueDate || input.memo,
        invoiceDate: fields.invoiceDate || new Date().toISOString().slice(0, 10),
        clientName: fields.clientName || "Client",
        clientEmail: fields.clientEmail,
        merchantName: fields.merchantName || "PayLink",
        merchantEmail: fields.merchantEmail || "merchant@example.com",
        note: fields.note,
        payUrl: fields.payUrl,
      };
      const remote = await client.createDraft(draft);
      return {
        reference: remote.id,
        url: fields.payUrl || remote.recipientViewUrl || "",
        recipient: draft.merchantEmail,
        asset: "USD",
        network: client.mode === "sandbox" ? "paypal-sandbox" : "paypal-demo",
      };
    },
    async check(input: PaymentCheckInput): Promise<PaymentCheckResult> {
      try {
        const remote = await client.get(input.reference);
        return classifyPaypalInvoice(remote, input.amount, input.dueDate, new Date());
      } catch (error) {
        const message = error instanceof Error ? error.message : "PayPal could not be reached.";
        if (client.mode === "sandbox") {
          return { status: isPastDue(input.dueDate, new Date()) ? "expired" : "pending", issue: "rpc_down", message };
        }
        return { status: isPastDue(input.dueDate, new Date()) ? "expired" : "pending", message };
      }
    },
    deliver(reference, note) {
      return client.send(reference, note);
    },
    chase(reference, note) {
      return client.remind(reference, note);
    },
    lookup(reference) {
      return client.get(reference);
    },
    verify(event, headers) {
      return client.verifyWebhook(event, headers);
    },
  };
}

export function classifyPaypalInvoice(remote: PaypalRemoteInvoice, expected: string, dueDate: string, now: Date): PaymentCheckResult {
  const status = remote.status.toUpperCase();
  if (status === "PAID" || status === "MARKED_AS_PAID") {
    const amountOk = remote.amountPaid ? compareUsd(remote.amountPaid, expected) >= 0 : true;
    const observation = classifyInvoiceObservation(
      {
        found: true,
        amountOk,
        mintOk: true,
        signature: remote.transactionId,
        amountReceived: remote.amountPaid || paypalAmount(expected),
      },
      dueDate,
      now,
    );
    return {
      ...observation,
      explorerUrl: remote.recipientViewUrl,
      message: amountOk ? "PayPal marked the invoice paid." : "PayPal recorded less than the invoice amount.",
    };
  }
  if (status === "PARTIALLY_PAID") {
    return {
      status: "underpaid",
      issue: "underpaid",
      signature: remote.transactionId,
      amountReceived: remote.amountPaid,
      explorerUrl: remote.recipientViewUrl,
      message: "PayPal recorded a partial payment.",
    };
  }
  if (status === "CANCELLED" || status === "REFUNDED") {
    return { status: "expired", explorerUrl: remote.recipientViewUrl, message: `PayPal status is ${status}.` };
  }
  if (status === "PAYMENT_PENDING") {
    return { status: "pending", message: "PayPal is confirming the payment." };
  }
  if (isPastDue(dueDate, now)) {
    return { status: "expired", message: "The due date passed before PayPal reported a payment." };
  }
  return { status: "pending", explorerUrl: remote.recipientViewUrl, message: `PayPal status is ${status}.` };
}
