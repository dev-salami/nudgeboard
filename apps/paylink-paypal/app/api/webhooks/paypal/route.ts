import { applyWebhook } from "@/lib/invoices";
import { webhookHeaders } from "@/lib/paypal-client";
import { getPaypalRail } from "@/lib/provider";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  let event: unknown;
  try {
    event = JSON.parse(raw) as unknown;
  } catch {
    return Response.json({ ok: false, message: "Invalid JSON." }, { status: 400 });
  }
  const verification = await getPaypalRail().verify(event, webhookHeaders(request.headers));
  if (!verification.ok) return Response.json({ ok: false, message: verification.reason }, { status: 400 });
  const result = applyWebhook(event);
  return Response.json({ ...result, verification: verification.reason }, { status: result.ok ? 200 : 404 });
}
