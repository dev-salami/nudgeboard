import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { addDays, createId, isoDate, type ActivityEvent } from "@181hacks/paylink-core";
import { dataDir, merchantProfile } from "./env";
import type { Database, PaypalInvoice } from "./types";

const memory = { current: null as Database | null };

function directory(): string {
  return dataDir() || path.join(process.cwd(), "data");
}

function dbPath(): string {
  return path.join(directory(), "paypal-store.json");
}

function emptyDb(): Database {
  return {
    version: 1,
    merchant: merchantProfile(),
    invoices: [],
    receipts: [],
    activities: [],
    emails: [],
    inbox: [],
    webhookIds: [],
    sequence: 1040,
    seeded: false,
  };
}

function readFromDisk(): Database {
  try {
    const parsed = JSON.parse(readFileSync(dbPath(), "utf8")) as Database;
    if (parsed.version !== 1 || !Array.isArray(parsed.invoices)) return emptyDb();
    parsed.inbox ??= [];
    parsed.webhookIds ??= [];
    parsed.emails ??= [];
    parsed.receipts ??= [];
    parsed.activities ??= [];
    return parsed;
  } catch {
    return emptyDb();
  }
}

function writeToDisk(db: Database): void {
  mkdirSync(directory(), { recursive: true });
  writeFileSync(dbPath(), JSON.stringify(db, null, 2));
}

export function getDb(): Database {
  if (!memory.current) {
    memory.current = readFromDisk();
    if (!memory.current.seeded) {
      memory.current = seed(memory.current);
      writeToDisk(memory.current);
    }
  }
  return memory.current;
}

export function updateDb<T>(mutate: (db: Database) => T): T {
  const db = getDb();
  const result = mutate(db);
  memory.current = db;
  writeToDisk(db);
  return result;
}

export function resetStore(): Database {
  memory.current = seed(emptyDb());
  writeToDisk(memory.current);
  return memory.current;
}

export function blankStore(): Database {
  memory.current = emptyDb();
  memory.current.seeded = true;
  writeToDisk(memory.current);
  return memory.current;
}

export function logActivity(db: Database, event: Omit<ActivityEvent, "id" | "at"> & { at?: string }): ActivityEvent {
  const row: ActivityEvent = {
    id: createId("act"),
    at: event.at ?? new Date().toISOString(),
    kind: event.kind,
    title: event.title,
    detail: event.detail,
    invoiceId: event.invoiceId,
    href: event.href,
    txSignature: event.txSignature,
    sample: event.sample,
  };
  db.activities.unshift(row);
  db.activities = db.activities.slice(0, 80);
  return row;
}

function seed(db: Database): Database {
  const now = new Date();
  const stamp = now.toISOString();
  const merchant = db.merchant;
  const paidAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const pending: PaypalInvoice = {
    id: "inv_demo_northwind",
    number: "PP-2026-1001",
    clientName: "Northwind",
    clientEmail: "ap@northwind.example",
    description: "Homepage redesign",
    amount: "220.00",
    currency: "USD",
    dueDate: isoDate(addDays(now, 5)),
    status: "pending",
    channel: "agent",
    paypalStatus: "SENT",
    payment: {
      provider: "paypal",
      reference: "DEMO-INV2-NORTHWIND",
      url: "/pay/inv_demo_northwind",
      recipient: merchant.email || "amaka@amaka.studio",
      asset: "USD",
      network: "paypal-demo",
      status: "SENT",
    },
    createdAt: stamp,
    updatedAt: stamp,
  };
  const paid: PaypalInvoice = {
    id: "inv_demo_harbour",
    number: "PP-2026-1000",
    clientName: "Harbour & Co",
    clientEmail: "finance@harbour.example",
    description: "Brand system",
    amount: "480.00",
    currency: "USD",
    dueDate: isoDate(addDays(now, -3)),
    status: "paid",
    channel: "email",
    paypalStatus: "PAID",
    paidAt,
    paidVia: "paypal",
    amountReceived: "480.00",
    txSignature: "DEMO-TX-HARBOUR",
    receiptId: "rcp_demo_harbour",
    payment: {
      provider: "paypal",
      reference: "DEMO-INV2-HARBOUR",
      url: "/pay/inv_demo_harbour",
      recipient: merchant.email || "amaka@amaka.studio",
      asset: "USD",
      network: "paypal-demo",
      status: "PAID",
    },
    createdAt: paidAt,
    updatedAt: paidAt,
  };
  db.invoices = [pending, paid];
  db.receipts = [
    {
      id: "rcp_demo_harbour",
      invoiceId: paid.id,
      number: paid.number,
      clientName: paid.clientName,
      clientEmail: paid.clientEmail,
      description: paid.description,
      amount: paid.amount,
      currency: "USD",
      paidAt,
      paypalInvoiceId: paid.payment?.reference,
      transactionId: paid.txSignature,
      paidVia: "paypal",
      merchantName: merchant.name,
    },
  ];
  db.activities = [
    {
      id: "act_demo_paid",
      at: paidAt,
      kind: "receipt_issued",
      title: "Harbour & Co paid PP-2026-1000",
      detail: "480.00 USD via PayPal demo",
      invoiceId: paid.id,
      href: "/receipts/rcp_demo_harbour",
    },
    {
      id: "act_demo_sent",
      at: stamp,
      kind: "invoice_issued",
      title: "Sent PP-2026-1001 to Northwind",
      detail: "220.00 USD · Homepage redesign",
      invoiceId: pending.id,
      href: "/pay/inv_demo_northwind",
    },
  ];
  db.seeded = true;
  return db;
}
