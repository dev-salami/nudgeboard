import { ChatApp } from "@/components/chat-app";
import { Shell } from "@/components/shell";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  const db = getDb();
  return (
    <Shell merchantName={db.merchant.name}>
      <ChatApp />
    </Shell>
  );
}
