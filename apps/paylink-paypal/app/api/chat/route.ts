import { runChat } from "@/lib/agent";
import { appOrigin } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { message?: string; history?: { role: "user" | "assistant"; content: string }[] };
  if (!body.message?.trim()) return Response.json({ error: "Say what you want invoiced." }, { status: 400 });
  const result = await runChat({ message: body.message, history: body.history }, appOrigin(request));
  return Response.json(result);
}
