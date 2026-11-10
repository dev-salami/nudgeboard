import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { PRODUCT_NAME, PRODUCT_MARK, PRODUCT_DESCRIPTOR } from "./brand";
import { metadata } from "../app/layout";
import { merchantProfile } from "./env";
import { buildDraftBody, createPaypalClient } from "./paypal-client";

// Next's font loader runs at build time, not in the Node unit-test environment.
vi.mock("next/font/local", () => ({ default: () => ({ variable: "--font-sans" }) }));

describe("Nudgeboard display branding", () => {
  it("uses the product constants for page and shared metadata", () => {
    expect(PRODUCT_NAME).toBe("Nudgeboard");
    expect(PRODUCT_MARK).toBe("N");
    const title = `${PRODUCT_NAME} — ${PRODUCT_DESCRIPTOR}`;
    expect(metadata.title).toBe(title);
    expect(metadata.description).toContain(PRODUCT_NAME);
    expect(metadata.description).toContain(PRODUCT_DESCRIPTOR);
    expect(metadata.openGraph).toMatchObject({ title, description: metadata.description, siteName: PRODUCT_NAME });
    expect(metadata.twitter).toMatchObject({ title, description: metadata.description, card: "summary" });
  });

  it("wires landing wordmark/footer and payer chrome to the same constants", () => {
    const landing = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
    expect(landing).toContain('<span className="bold hidden sm:inline">{PRODUCT_NAME}</span>');
    expect(landing).toContain("{PRODUCT_NAME} · {PRODUCT_DESCRIPTOR}");
    expect(landing).toContain("{PRODUCT_MARK}");
    const payer = readFileSync(new URL("../app/pay/[id]/page.tsx", import.meta.url), "utf8");
    expect(payer).toContain("{PRODUCT_MARK}");
    expect(payer).toContain("`${PRODUCT_NAME} home`");
  });

  it("brands the fallback merchant but preserves configured merchant identity", () => {
    vi.stubEnv("MERCHANT_NAME", "");
    expect(merchantProfile().name).toBe(PRODUCT_NAME);
    vi.stubEnv("MERCHANT_NAME", "Fictional Studio");
    expect(merchantProfile().name).toBe("Fictional Studio");
  });

  it("brands PayPal draft notes and send subjects without a network request", async () => {
    const input = { invoiceNumber: "DEMO-TEST", localId: "demo-test", amount: "120", description: "Design",
      dueDate: "2026-12-01", invoiceDate: "2026-11-10", clientName: "Northwind", merchantName: PRODUCT_NAME, merchantEmail: "merchant@example.com" };
    expect(buildDraftBody(input).detail).toMatchObject({ note: `Sent by ${PRODUCT_NAME}.` });
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/token")) return Response.json({ access_token: "mock", expires_in: 300 });
      if (String(url).endsWith("/send")) {
        expect(JSON.parse(String(init?.body)).subject).toBe(`Invoice from ${PRODUCT_NAME}`);
        return new Response(null, { status: 202 });
      }
      return Response.json({ id: "INV2-TEST", status: "SENT" });
    });
    const client = createPaypalClient({ mode: "sandbox", clientId: "mock", clientSecret: "mock", fetchImpl });
    await client.send("INV2-TEST");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps an empty, sandbox-only buyer placeholder after the leading judge path", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    expect(readme.startsWith(`# ${PRODUCT_NAME}\n\n## 60-second judge path`)).toBe(true);
    expect(readme).toContain("Sandbox buyer: &lt;to be added&gt;");
    expect(readme).toContain("not this app's merchant REST credentials");
    expect(readme).toContain("No login is required to inspect the labelled Judge demo queue.");
  });
});
