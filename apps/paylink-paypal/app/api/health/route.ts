import { paypalMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, app: "paylink-paypal", paypal: paypalMode() });
}
