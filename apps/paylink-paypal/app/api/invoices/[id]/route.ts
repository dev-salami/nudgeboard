import { findInvoice, syncInvoice } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let invoice = findInvoice(id);
  if (!invoice) return Response.json({ error: "Invoice not found." }, { status: 404 });
  if (invoice.payment?.network === "paypal-sandbox") invoice = await syncInvoice(id);
  return Response.json({ invoice });
}
