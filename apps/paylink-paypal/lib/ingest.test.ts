import { describe, expect, it } from "vitest";
import { parseInbound } from "./ingest";

const now = new Date("2026-11-05T12:00:00Z");

describe("inbound requests", () => {
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
