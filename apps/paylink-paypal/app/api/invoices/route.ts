import { paypalMode } from "@/lib/env";
import { getDb } from "@/lib/store";
import { pollSandboxInvoices } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export async function GET() {
  await pollSandboxInvoices();
  const db = getDb();
  return Response.json({ invoices: db.invoices, paypal: paypalMode(), merchant: db.merchant.name });
}
