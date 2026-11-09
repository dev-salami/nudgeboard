import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "../app/api/invoices/[id]/agent/route";
import { blankStore, getDb, updateDb } from "./store";
import { judgeDemoInvoices } from "./judge-demo-seed";
import { agentInvoice } from "./agent-invoice";

beforeEach(() => { vi.stubEnv("DATA_DIR", mkdtempSync(path.join(tmpdir(), "paypal-agent-invoice-"))); blankStore(); });
function read(id: string, query = "") { return GET(new Request(`http://localhost:3030/api/invoices/${id}/agent${query}`), { params: Promise.resolve({ id }) }); }
it("returns only the public schema, never merchant/payer metadata or activity", async () => {
  const row = judgeDemoInvoices()[0]!;
  row.payment!.hostedUrl = "https://www.sandbox.paypal.com/invoice/p/#INV2-TEST";
  updateDb((db) => { db.invoices.push(row); });
  const before = JSON.stringify(getDb());
  const response = await read(row.id);
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  const json = await response.json();
  expect(json).toMatchObject({ profile: "paypal-invoice", version: 1, number: row.number, amount: row.amount, currency: "USD", dueDate: row.dueDate, status: row.status,
    payment: { payPath: `/pay/${row.id}`, hostedPaypalUrl: row.payment!.hostedUrl } });
  expect(Object.keys(json).sort()).toEqual(["profile", "version", "number", "amount", "currency", "dueDate", "status", "paypalStatus", "remainingBalance", "source", "payment"].sort());
  expect(JSON.stringify(json)).not.toContain(row.clientEmail);
  expect(json).not.toHaveProperty("activities"); expect(json).not.toHaveProperty("clientName");
  expect(JSON.stringify(getDb())).toBe(before); expect(fetch).not.toHaveBeenCalled();
});
it("returns indistinguishable 404s for missing and draft invoices", async () => {
  const row = { ...judgeDemoInvoices()[0]!, status: "draft" as const };
  updateDb((db) => { db.invoices.push(row); });
  const missing = await read("missing"); const draft = await read(row.id);
  expect(missing.status).toBe(404); expect(draft.status).toBe(404);
  expect(await missing.json()).toEqual(await draft.json());
  expect(agentInvoice({ ...row, status: "pending", paypalStatus: "DRAFT" })).toBeNull();
});
it("never publishes a production/custom hosted URL", () => {
  for (const hostedUrl of ["https://www.paypal.com/invoice/x", "https://www.sandbox.paypal.com.evil.example/x", "https://user@www.sandbox.paypal.com/x", "javascript:alert(1)"]) {
    const row = judgeDemoInvoices()[0]!; row.payment!.hostedUrl = hostedUrl;
    expect(agentInvoice(row)?.payment.hostedPaypalUrl).toBeUndefined();
  }
});
it("offers the labelled isolated demo without populating real books", async () => {
  const response = await read("inv_demo_northwind", "?books=demo");
  expect(response.status).toBe(200); expect((await response.json()).source).toBe("judge-demo");
  expect(getDb().invoices).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
});
