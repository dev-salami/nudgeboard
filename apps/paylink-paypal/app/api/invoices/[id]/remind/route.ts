import { appOrigin } from "@/lib/env";
import { remindInvoice } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const result = await remindInvoice(id, appOrigin(request));
    if (result.refusal) return Response.json({ error: result.refusal, invoice: result.invoice }, { status: 400 });
    return Response.json({ invoice: result.invoice, message: `Reminded ${result.invoice.clientName}.` });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Reminder failed." }, { status: 400 });
  }
}
