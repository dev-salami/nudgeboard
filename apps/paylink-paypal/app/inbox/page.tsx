import { InboxForm } from "@/components/inbox-form";
import { Shell } from "@/components/shell";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  const db = getDb();
  return (
    <Shell merchantName={db.merchant.name}>
      <p className="text-sm text-muted">Stub adapters</p>
      <h1 className="mb-6 text-4xl">Job requests</h1>
      <InboxForm />
      {db.inbox.length ? (
        <section className="mt-6">
          <h2 className="mb-3 text-xl">Recent</h2>
          <ul className="grid gap-2">
            {db.inbox.slice(0, 8).map((item) => (
              <li key={item.id} className="card px-4 py-3 text-sm">
                <span className="pill">{item.channel}</span>
                <span className="ml-3 text-muted">{item.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Shell>
  );
}
