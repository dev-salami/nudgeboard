import { cancelConfirmation } from "@/lib/confirmations";
import { remindInvoice, sendExisting } from "@/lib/invoices";
import { getDb } from "@/lib/store";
import type { PaypalInvoice } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  // JSON-only explicit UI decision. Text/model output is never authorization.
  if (!request.headers.get("content-type")?.startsWith("application/json") || request.headers.get("sec-fetch-site") === "cross-site"
    || (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)) {
    return Response.json({ error: "Use the same-origin confirmation UI." }, { status: 403 });
  }
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Use an explicit confirmation decision." }, { status: 400 });
  const record = getDb().confirmations.find((row) => row.id === id);
  if (!record) return Response.json({ error: "Preview not found." }, { status: 404 });
  if (body.decision === "cancel") {
    try { return Response.json({ confirmation: cancelConfirmation(id), message: "Cancelled. Nothing sent." }); }
    catch { return Response.json({ error: "This preview is no longer pending." }, { status: 409 }); }
  }
  if (body.decision !== "confirm" || body.invoiceId !== record.invoiceId || body.action !== record.action) {
    return Response.json({ error: "Explicit confirmation must match the preview action and invoice." }, { status: 400 });
  }
  if (record.state === "done") return Response.json({ confirmation: record, message: "Already completed. No action repeated." });
  try {
    const result: { invoice: PaypalInvoice; refusal?: string } = record.action === "send"
      ? { invoice: await sendExisting(record.invoiceId, record.origin, record.id) }
      : await remindInvoice(record.invoiceId, record.origin, record.id);
    return Response.json({ ...result, confirmation: record, message: result.refusal || "Confirmed action completed. Payment status is not inferred from sending." });
  } catch (error) {
    return Response.json({ confirmation: record, error: error instanceof Error ? error.message : "Action could not be confirmed." }, { status: 409 });
  }
}
