import { agentInvoice } from "@/lib/agent-invoice";
import { getDb, getJudgeDemoDb } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const demo = new URL(request.url).searchParams.get("books") === "demo";
  const invoice = (demo ? getJudgeDemoDb() : getDb()).invoices.find((row) => row.id === id);
  const result = invoice ? agentInvoice(invoice) : null;
  return Response.json(result || { error: "Issued invoice not found." }, { status: result ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}
