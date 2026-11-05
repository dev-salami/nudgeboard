import { paypalMode } from "@/lib/env";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET() {
  const db = getDb();
  return Response.json({ invoices: db.invoices, paypal: paypalMode(), merchant: db.merchant.name });
}
