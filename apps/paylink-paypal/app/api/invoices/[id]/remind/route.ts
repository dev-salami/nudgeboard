import { appOrigin } from "@/lib/env";
import { prepareReminderConfirmation } from "@/lib/confirmations";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const confirmation = await prepareReminderConfirmation(id, appOrigin(request));
    return Response.json({ confirmation, message: "Reminder preview only. Nothing sent; explicit confirmation is required." });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Reminder failed." }, { status: 400 });
  }
}
