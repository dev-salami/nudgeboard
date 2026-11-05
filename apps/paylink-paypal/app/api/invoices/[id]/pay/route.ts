import { paypalMode } from "@/lib/env";
import { completeDemoPayment, syncInvoice } from "@/lib/invoices";
import type { PaidVia } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { method?: string };
  const method: PaidVia = body.method === "card" ? "card" : "paypal";
  try {
    if (paypalMode() === "sandbox") {
      const invoice = await syncInvoice(id);
      return Response.json({
        invoice,
        receiptId: invoice.receiptId,
        message: invoice.status === "paid" ? "PayPal marked this paid." : "PayPal has not marked this paid yet.",
      });
    }
    const invoice = completeDemoPayment(id, method);
    return Response.json({ invoice, receiptId: invoice.receiptId });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Payment failed." }, { status: 400 });
  }
}
