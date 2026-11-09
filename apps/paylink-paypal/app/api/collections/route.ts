import { collectionsQueue } from "@/lib/collections-queue";
import { prepareReminderConfirmation, prepareWriteoffConfirmation } from "@/lib/confirmations";
import { modeInvoices } from "@/lib/ledger";
import { paypalMode } from "@/lib/env";
import { getDb } from "@/lib/store";
import { withJudgeDemo } from "@/lib/judge-demo-context";

export async function POST(request: Request) {
  return new URL(request.url).searchParams.get("books") === "demo" ? withJudgeDemo(() => prepare(request)) : prepare(request);
}

async function prepare(request: Request) {
  const origin = new URL(request.url).origin;
  if (!request.headers.get("content-type")?.startsWith("application/json") || request.headers.get("sec-fetch-site") === "cross-site"
    || (request.headers.get("origin") && request.headers.get("origin") !== origin)) return Response.json({ error: "Use the same-origin queue." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body?.invoiceIds) || body.invoiceIds.length > 100 || !body.invoiceIds.every((id: unknown) => typeof id === "string")) return Response.json({ error: "Select exact invoices." }, { status: 400 });
  const queue = collectionsQueue(modeInvoices(getDb().invoices, paypalMode()));
  const results = [];
  for (const id of new Set<string>(body.invoiceIds)) {
    try {
      const proposal = queue.find((row) => row.invoiceId === id);
      if (!proposal) throw new Error("Invoice is not open in the active books.");
      const confirmation = proposal.action === "writeoff" ? prepareWriteoffConfirmation(id, origin) : await prepareReminderConfirmation(id, origin, proposal.tone);
      results.push({ invoiceId: id, proposal, confirmation });
    } catch (error) { results.push({ invoiceId: id, error: error instanceof Error ? error.message : "Preview failed." }); }
  }
  return Response.json({ results });
}
