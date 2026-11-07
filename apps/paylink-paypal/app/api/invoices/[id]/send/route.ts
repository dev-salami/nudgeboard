import { appOrigin } from "@/lib/env";
import { prepareConfirmation } from "@/lib/confirmations";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const confirmation = prepareConfirmation(id, "send", appOrigin(request));
    return Response.json({ confirmation, message: "Invoice preview only. Nothing sent; explicit confirmation is required." });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Send failed." }, { status: 400 });
  }
}
