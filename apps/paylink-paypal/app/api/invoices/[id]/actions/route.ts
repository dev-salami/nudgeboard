import { prepareMoneyConfirmation, prepareWriteoffConfirmation, prepareReminderConfirmation } from "@/lib/confirmations";
import { syncInvoice } from "@/lib/invoices";
import { withJudgeDemo } from "@/lib/judge-demo-context";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const origin = new URL(request.url).origin;
  if (!request.headers.get("content-type")?.startsWith("application/json") || request.headers.get("sec-fetch-site") === "cross-site" || (request.headers.get("origin") && request.headers.get("origin") !== origin)) return Response.json({ error: "Use the same-origin action UI." }, { status: 403 });
  const prepare = async () => {
    try {
      const { id } = await context.params;
      const body = await request.json();
      if (body.action === "sync") return Response.json({ invoice: await syncInvoice(id), message: "Synced via PayPal invoice GET." });
      const confirmation = body.action === "writeoff" ? prepareWriteoffConfirmation(id, origin)
        : body.action === "remind" ? await prepareReminderConfirmation(id, origin)
        : body.action === "record-payment" || body.action === "record-refund" ? prepareMoneyConfirmation(id, body.action, body.input, origin) : null;
      if (!confirmation) throw new Error("Choose an exact action.");
      return Response.json({ confirmation });
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid action preview." }, { status: 400 }); }
  };
  return new URL(request.url).searchParams.get("books") === "demo" ? withJudgeDemo(prepare) : prepare();
}
