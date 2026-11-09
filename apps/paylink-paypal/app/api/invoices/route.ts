import { paypalMode } from "@/lib/env";
import { getDb } from "@/lib/store";
import { pollSandboxInvoices } from "@/lib/invoices";
import { modeInvoices } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  await pollSandboxInvoices();
  const db = getDb();
  return Response.json({ invoices: modeInvoices(db.invoices, paypalMode()), paypal: paypalMode(), merchant: db.merchant.name });
}
