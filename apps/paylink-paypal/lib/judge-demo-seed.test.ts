import { beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { judgeDemoInvoices, JUDGE_DEMO_LABEL } from "./judge-demo-seed";
import { booksView, collectionDays } from "./books-view";
import { blankStore, getDb, updateDb } from "./store";
import { totals } from "./invoices";
import { paypalMode } from "./env";
import { withJudgeDemo } from "./judge-demo-context";
import { collectionsQueue } from "./collections-queue";

const now = new Date("2026-11-09T12:00:00Z");
beforeEach(() => { vi.stubEnv("DATA_DIR", mkdtempSync(path.join(tmpdir(), "paypal-seed-"))); blankStore(); });
it("provides fictional labelled histories, partials, terminal states and 24-day collections without credentials", () => {
  const rows = judgeDemoInvoices(now);
  expect(rows.every((r) => r.sample && r.source === "judge-demo" && r.payment?.network === "paypal-demo" && r.clientEmail?.endsWith(".example"))).toBe(true);
  expect(rows.filter((r) => r.clientName === "Harbour" && r.status === "paid")).toHaveLength(4);
  expect(rows.some((r) => r.status === "underpaid" && r.amountReceived === "40.00")).toBe(true);
  expect(rows.map((r) => r.paypalStatus)).toEqual(expect.arrayContaining(["CANCELLED", "REFUNDED"]));
  expect(collectionDays(rows, now)).toHaveLength(24);
  expect(collectionDays(rows, now).filter((n) => n > 0).length).toBeGreaterThan(8);
  expect(collectionsQueue(rows, now).length).toBeGreaterThan(4);
  expect(JUDGE_DEMO_LABEL).toMatch(/not PayPal sandbox invoices/);
  expect(fetch).not.toHaveBeenCalled();
});
it("defaults empty sandbox books to demo but never includes samples in real totals", () => {
  expect(booksView([], "sandbox").demo).toBe(true);
  expect(booksView([], "sandbox", "sandbox").rows).toEqual([]);
  updateDb((db) => { db.invoices = judgeDemoInvoices(now); });
  expect(totals()).toMatchObject({ outstanding: 0, collected: 0, overdue: 0 });
  const real = { ...judgeDemoInvoices(now)[0], id: "real", sample: false, payment: undefined };
  expect(booksView([real], "sandbox").demo).toBe(false);
  expect(booksView([real], "sandbox", "demo").demo).toBe(true);
});
it("isolates judge mutations and mode from the persisted merchant ledger", async () => {
  vi.stubEnv("PAYPAL_MODE", "sandbox"); vi.stubEnv("PAYPAL_CLIENT_ID", "mock"); vi.stubEnv("PAYPAL_CLIENT_SECRET", "mock");
  const disk = readFileSync(path.join(process.env.DATA_DIR!, "paypal-store.json"), "utf8");
  await withJudgeDemo(async () => {
    expect(paypalMode()).toBe("demo");
    expect(getDb().invoices.length).toBeGreaterThan(10);
    updateDb((db) => { db.invoices[0].description = "Isolated demo edit"; });
    await Promise.resolve(); expect(paypalMode()).toBe("demo");
  });
  expect(paypalMode()).toBe("sandbox"); expect(getDb().invoices).toEqual([]);
  expect(readFileSync(path.join(process.env.DATA_DIR!, "paypal-store.json"), "utf8")).toBe(disk);
});
