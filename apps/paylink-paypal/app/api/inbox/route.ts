import { createId } from "@181hacks/paylink-core";
import { appOrigin } from "@/lib/env";
import { parseInbound } from "@/lib/ingest";
import { prepareConfirmation } from "@/lib/confirmations";
import { issueInvoice } from "@/lib/invoices";
import { formatUsd } from "@/lib/money";
import { updateDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { channel?: string; raw?: string };
  const channel = body.channel === "whatsapp" ? "whatsapp" : body.channel === "email" ? "email" : null;
  if (!channel || !body.raw?.trim()) return Response.json({ error: "Paste an email or a WhatsApp message." }, { status: 400 });
  const parsed = parseInbound(body.raw, channel);
  if (!parsed.ok) return Response.json({ error: parsed.hint }, { status: 400 });
  try {
    const invoice = await issueInvoice({
      clientName: parsed.clientName,
      clientEmail: parsed.clientEmail,
      description: parsed.description,
      amount: parsed.amount,
      dueDate: parsed.dueDate,
      asDraft: true,
      channel,
      origin: appOrigin(request),
    });
    updateDb((db) => {
      db.inbox.unshift({
        id: createId("inb"),
        at: new Date().toISOString(),
        channel,
        raw: body.raw ?? "",
        invoiceId: invoice.id,
        summary: `${parsed.clientName} · ${formatUsd(parsed.amount)} USD`,
      });
    });
    return Response.json({
      invoice,
      confirmation: invoice.clientEmail ? prepareConfirmation(invoice.id, "send", appOrigin(request)) : undefined,
      reply: `Local draft ${invoice.number} for ${invoice.clientName}. ${formatUsd(invoice.amount)} USD. Nothing sent; review and explicitly confirm from the invoice page.`,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create the invoice." }, { status: 400 });
  }
}
