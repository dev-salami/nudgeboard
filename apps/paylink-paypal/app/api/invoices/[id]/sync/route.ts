import { syncInvoice } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const invoice = await syncInvoice(id);
    return Response.json({ invoice, message: `${invoice.number} is ${invoice.status}.` });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Sync failed." }, { status: 400 });
  }
}
