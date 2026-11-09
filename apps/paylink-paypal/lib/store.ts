import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, fsyncSync } from "node:fs";
import path from "node:path";
import { addDays, createId, isoDate, type ActivityEvent } from "@181hacks/paylink-core";
import { dataDir, merchantProfile, paypalMode } from "./env";
import type { Database, PaypalInvoice } from "./types";
import { inJudgeDemo } from "./judge-demo-context";
import { judgeDemoInvoices } from "./judge-demo-seed";

const memory = { current: null as Database | null };
let judgeDb: Database | null = null;

export function getJudgeDemoDb(): Database {
  if (!judgeDb) {
    judgeDb = { ...emptyDb(), merchant: { name: "Demo Studio", city: "Demo", email: "merchant@studio.example" }, invoices: judgeDemoInvoices(), seeded: true };
  }
  return judgeDb;
}

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
    confirmations: [],
    sequence: 1040,
    seeded: false,
  };
}

function readFromDisk(): Database {
  try {
    const parsed = JSON.parse(readFileSync(dbPath(), "utf8")) as Database;
    if (parsed.version !== 1 || !Array.isArray(parsed.invoices)) throw new Error("Invalid PayPal store; restore it before sending.");
    parsed.inbox ??= [];
    parsed.webhookIds ??= [];
    parsed.emails ??= [];
    parsed.receipts ??= [];
    parsed.activities ??= [];
    parsed.confirmations ??= [];
    // Label samples saved by earlier versions, without discarding history.
    for (const row of parsed.invoices) if (["inv_demo_northwind", "inv_demo_harbour"].includes(row.id)) row.sample = true;
    for (const row of parsed.receipts) if (row.id === "rcp_demo_harbour") row.sample = true;
    if (!Array.isArray(parsed.confirmations)) throw new Error("Invalid confirmation store; restore it before sending.");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyDb();
    throw error; // Never erase dispatch reservations after corruption/read failure.
  }
}

function writeToDisk(db: Database): void {
  mkdirSync(directory(), { recursive: true });
  const temporary = `${dbPath()}.tmp`;
  const file = openSync(temporary, "w", 0o600);
  try { writeFileSync(file, JSON.stringify(db, null, 2)); fsyncSync(file); }
  finally { closeSync(file); }
  renameSync(temporary, dbPath());
  const folder = openSync(directory(), "r");
  try { fsyncSync(folder); } finally { closeSync(folder); }
}

export function getDb(): Database {
  if (inJudgeDemo()) return getJudgeDemoDb();
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
  if (!inJudgeDemo()) writeToDisk(db);
  return result;
}

export function resetStore(): Database {
  judgeDb = null;
  memory.current = seed(emptyDb());
  writeToDisk(memory.current);
  return memory.current;
}

export function blankStore(): Database {
  judgeDb = null;
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
  if (paypalMode() === "sandbox") {
    db.seeded = true;
    return db;
  }
  const now = new Date();
  const stamp = now.toISOString();
  const merchant = db.merchant;
  const paidAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const pending: PaypalInvoice = {
    id: "inv_demo_northwind",
    sample: true,
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
    sample: true,
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
  db.invoices = judgeDemoInvoices(now);
  db.receipts = [
    {
      id: "rcp_demo_harbour",
      sample: true,
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
      sample: true,
      at: paidAt,
      kind: "receipt_issued",
      title: "Harbour & Co paid PP-2026-1000",
      detail: "480.00 USD via PayPal demo",
      invoiceId: paid.id,
      href: "/receipts/rcp_demo_harbour",
    },
    {
      id: "act_demo_sent",
      sample: true,
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
