import { appOrigin } from "@/lib/env";
import { sendExisting } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const invoice = await sendExisting(id, appOrigin(request));
    return Response.json({ invoice, message: `Sent ${invoice.number}.` });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Send failed." }, { status: 400 });
  }
}
