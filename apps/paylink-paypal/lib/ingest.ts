import { parseDemoCommand, parseDueDate, type DemoIntent } from "@181hacks/paylink-core";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export interface InboundDraft {
  ok: true;
  channel: "email" | "whatsapp";
  clientName: string;
  clientEmail?: string;
  amount: string;
  description: string;
  dueDate: string;
}

export interface InboundMiss {
  ok: false;
  hint: string;
}

export function detectChannel(text: string): "email" | "whatsapp" | null {
  const trimmed = text.trim();
  if (/^from:/im.test(trimmed) || /^subject:/im.test(trimmed)) return "email";
  if (/^[^:\n]{2,48}:\s+\S/.test(trimmed) && !/^invoice\b/i.test(trimmed)) return "whatsapp";
  return null;
}

export function parseInbound(raw: string, channel: "email" | "whatsapp", now = new Date()): InboundDraft | InboundMiss {
  const text = raw.trim();
  if (!text) return { ok: false, hint: "Paste the email or the WhatsApp message first." };

  const email = text.match(EMAIL)?.[0];
  const headerName = channel === "email" ? emailFromHeader(text) : whatsappName(text);
  const subject = text.match(/^subject:\s*(.+)$/im)?.[1]?.trim();
  const withoutEmail = email ? text.replace(email, " ") : text;
  const body = stripHeaders(withoutEmail, channel);

  const viaAgent = parseDemoCommand(body, now);
  const created = viaAgent.type === "create_invoice" ? viaAgent : parseLoose(body, now);

  const clientName = headerName || (created && "clientName" in created ? created.clientName : "");
  const amount = created && "amount" in created ? created.amount : "";
  if (!clientName || !amount) {
    return {
      ok: false,
      hint: "I need a name and an amount, such as “Ada — 480 USD for the logo, due Friday”.",
    };
  }
  const description =
    (created && "description" in created && created.description && created.description !== "Services" ? created.description : "") ||
    subject ||
    "Services";
  const dueDate = created && "dueDate" in created && created.dueDate ? created.dueDate : parseDueDate(undefined, now);

  return {
    ok: true,
    channel,
    clientName,
    clientEmail: email,
    amount,
    description,
    dueDate,
  };
}

function parseLoose(text: string, now: Date): Extract<DemoIntent, { type: "create_invoice" }> | null {
  const amountMatch = text.match(/(?:\$|usd\s*)?(\d+(?:\.\d{1,2})?)\s*(?:usd|dollars)?/i);
  if (!amountMatch?.[1] || amountMatch.index === undefined) return null;
  const amount = amountMatch[1];
  let description = "Services";
  let duePhrase: string | undefined;
  const after = text.slice(amountMatch.index + amountMatch[0].length);
  const dueSplit = after.split(/\bdue\b/i);
  const beforeDue = dueSplit[0] ?? "";
  if (dueSplit.length > 1) duePhrase = clean(dueSplit.slice(1).join(" "));
  const forMatch = beforeDue.match(/\bfor\b\s+(.+)/i);
  if (forMatch?.[1]) description = clean(forMatch[1]);
  return {
    type: "create_invoice",
    clientName: "",
    amount,
    description: description || "Services",
    dueDate: parseDueDate(duePhrase, now),
    asDraft: false,
  };
}

function emailFromHeader(text: string): string {
  const from = text.match(/^from:\s*(.+)$/im)?.[1]?.trim() ?? "";
  const named = from.match(/^([^<]+)</);
  if (named?.[1]) return titleCase(clean(named[1]));
  if (from && !from.includes("@")) return titleCase(clean(from));
  return "";
}

function whatsappName(text: string): string {
  const match = text.match(/^([^:\n]{2,48}):\s+/);
  if (!match?.[1]) return "";
  return titleCase(clean(match[1].replace(/\s*\(.*?\)\s*$/, "")));
}

function stripHeaders(text: string, channel: "email" | "whatsapp"): string {
  if (channel === "whatsapp") return text.replace(/^[^:\n]{2,48}:\s+/, "");
  return text
    .split("\n")
    .filter((line) => !/^(from|to|subject|date|cc):\s/i.test(line.trim()))
    .join("\n")
    .trim();
}

function clean(value: string): string {
  return value.replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "").replace(/\s+/g, " ");
}

function titleCase(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
