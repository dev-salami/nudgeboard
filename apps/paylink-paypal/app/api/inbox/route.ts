import { createId } from "@181hacks/paylink-core";
import { appOrigin } from "@/lib/env";
import { extractInbound } from "@/lib/ai";
import { issueInvoice } from "@/lib/invoices";
import { formatUsd } from "@/lib/money";
import { updateDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { channel?: string; raw?: string };
  const channel = body.channel === "whatsapp" ? "whatsapp" : body.channel === "email" ? "email" : null;
  if (!channel || !body.raw?.trim()) return Response.json({ error: "Paste an email or a WhatsApp message." }, { status: 400 });
  const parsed = await extractInbound(body.raw, channel);
  if (!parsed.ok) return Response.json({ error: parsed.hint }, { status: 400 });
  try {
    const invoice = await issueInvoice({
      clientName: parsed.clientName,
      clientEmail: parsed.clientEmail,
      description: parsed.description,
      amount: parsed.amount,
      dueDate: parsed.dueDate,
      asDraft: false,
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
      reply: `PayPal invoice ${invoice.number} is ready for ${invoice.clientName}. ${formatUsd(invoice.amount)} USD.`,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create the invoice." }, { status: 400 });
  }
}
