import { findInvoice } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const invoice = findInvoice(id);
  if (!invoice) return Response.json({ error: "Invoice not found." }, { status: 404 });
  return Response.json({ invoice });
}
