import { describe, expect, it } from "vitest";
import { detectChannel, parseInbound } from "./ingest";

const now = new Date("2026-11-05T12:00:00Z");

describe("inbound requests", () => {
  it.each([
    "Please draft a bill for Ada: four hundred eighty dollars for her logo, due tomorrow. Her email is ada@example.com.",
    "Draft for Ada: 480 USD for her logo",
    "Please invoice Ada: 480 USD for her logo",
    "Invoice Ada: 480 USD for her logo",
    "Create an invoice: Ada owes 480 USD",
  ])("keeps colon-containing merchant commands on the agent path: %s", (message) => {
    expect(detectChannel(message)).toBeNull();
  });

  it("still recognizes pasted sender labels and email headers", () => {
    expect(detectChannel("Ada Lovelace: please draft a bill for 480 USD")).toBe("whatsapp");
    expect(detectChannel("Ada: hey can you invoice 220 for the homepage")).toBe("whatsapp");
    expect(detectChannel("From: Ada <ada@example.com>\nSubject: Logo\nPlease draft an invoice.")).toBe("email");
  });

  it("reads an email-style job request", () => {
    const parsed = parseInbound(
      `From: Ada Lovelace <ada@example.com>
Subject: Spring logo

Please invoice 480 USD for the logo system, due Friday.
`,
      "email",
      now,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.clientName).toBe("Ada Lovelace");
    expect(parsed.clientEmail).toBe("ada@example.com");
    expect(parsed.amount).toBe("480");
    expect(parsed.description).toMatch(/logo system/i);
    expect(parsed.dueDate).toBe("2026-11-06");
  });

  it("reads a WhatsApp-style payment request", () => {
    const parsed = parseInbound(
      "Ada Lovelace: hey can you invoice 220 for the homepage, due tomorrow. ada@northwind.dev",
      "whatsapp",
      now,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.clientName).toBe("Ada Lovelace");
    expect(parsed.clientEmail).toBe("ada@northwind.dev");
    expect(parsed.amount).toBe("220");
    expect(parsed.description).toMatch(/homepage/i);
    expect(parsed.dueDate).toBe("2026-11-06");
  });
});
