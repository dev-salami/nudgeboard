import type { ActivityEvent, EmailRecord, InvoiceStatus, PaymentIssue } from "@181hacks/paylink-core";

/** PayPal settles fiat. This stays in the app so core keeps its USDC invoice shape. */
export type PaypalCurrency = "USD";

export interface PaypalPayment {
  provider: "paypal";
  /** PayPal invoice id, or a DEMO-INV2 id when credentials are unset. */
  reference: string;
  /** Our payer page. Sandbox checkout continues to PayPal from here. */
  url: string;
  hostedUrl?: string;
  recipient: string;
  asset: "USD";
  network: "paypal-sandbox" | "paypal-demo";
  status?: string;
}

export type PaidVia = "paypal" | "card";

export interface PaypalInvoice {
  id: string;
  number: string;
  clientName: string;
  clientEmail?: string;
  description: string;
  amount: string;
  currency: PaypalCurrency;
  dueDate: string;
  status: InvoiceStatus;
  payment?: PaypalPayment;
  paymentIssue?: PaymentIssue;
  paymentIssueDetail?: string;
  txSignature?: string;
  paidVia?: PaidVia;
  paidAt?: string;
  amountReceived?: string;
  receiptId?: string;
  sample?: boolean;
  channel?: "agent" | "email" | "whatsapp" | "manual";
  paypalStatus?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaypalReceipt {
  id: string;
  invoiceId: string;
  number: string;
  clientName: string;
  clientEmail?: string;
  description: string;
  amount: string;
  currency: PaypalCurrency;
  paidAt: string;
  paypalInvoiceId?: string;
  transactionId?: string;
  paidVia?: PaidVia;
  merchantName: string;
  sample?: boolean;
}

export interface InboundMessage {
  id: string;
  at: string;
  channel: "email" | "whatsapp";
  raw: string;
  invoiceId?: string;
  summary?: string;
}

export interface Database {
  version: 1;
  merchant: { name: string; city: string; email?: string };
  invoices: PaypalInvoice[];
  receipts: PaypalReceipt[];
  activities: ActivityEvent[];
  emails: EmailRecord[];
  inbox: InboundMessage[];
  webhookIds: string[];
  sequence: number;
  seeded: boolean;
}

export type { ActivityEvent, EmailRecord, InvoiceStatus, PaymentIssue };
