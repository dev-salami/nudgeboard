import Link from "next/link";
import { CollectionsQueue } from "@/components/collections-queue";
import { ArcGauge, BarStrip, type Bar } from "@/components/keel";
import { DashboardLive } from "@/components/dashboard-live";
import { Shell } from "@/components/shell";
import { paypalMode } from "@/lib/env";
import { formatUsd } from "@/lib/money";
import { getDb } from "@/lib/store";
import type { PaypalInvoice } from "@/lib/types";
import { booksView, collectionDays } from "@/lib/books-view";
import { JUDGE_DEMO_LABEL } from "@/lib/judge-demo-seed";
import { collectedAmount } from "@/lib/ledger";

export const dynamic = "force-dynamic";

function dailyBars(invoices: PaypalInvoice[]): Bar[] {
  const bars: Bar[] = collectionDays(invoices).map((value) => ({ value, on: value > 0 }));
  const best = bars.reduce((winner, bar, index) => (bar.value > (bars[winner]?.value ?? 0) ? index : winner), 0);
  const chosen = bars[best];
  if (chosen && chosen.value > 0) chosen.label = { top: formatUsd(chosen.value), sub: "Received" };
  return bars;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ books?: string }> }) {
  const db = getDb();
  const mode = paypalMode();
  const { rows, demo } = booksView(db.invoices, mode, (await searchParams).books);
  const real = rows.filter((invoice) => invoice.status !== "draft" && !["CANCELLED", "REFUNDED"].includes(invoice.paypalStatus || ""));
  const billed = real.reduce((total, invoice) => total + Number(invoice.amount), 0);
  const collected = real.reduce((total, invoice) => total + collectedAmount(invoice), 0);
  const ratio = billed > 0 ? collected / billed : 0;

  return (
    <Shell merchantName={db.merchant.name}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted">{demo ? JUDGE_DEMO_LABEL : mode === "sandbox" ? "PayPal sandbox" : "Demo mode — simulated checkout"}</p>
        <Link href={demo ? "/dashboard?books=sandbox" : "/dashboard?books=demo"} className="btn btn-ghost">{demo ? "View sandbox books" : "View judge demo"}</Link>
        <Link href="/chat" className="btn btn-primary px-5">+ New invoice</Link>
      </div>
      <CollectionsQueue key={`${demo}`} invoices={rows} demo={demo} />
      <DashboardLive key={`${demo}`} initial={rows} demo={demo} />
      <section className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <article className="card p-6">
          <h2 className="text-xl">Collections, last 24 days</h2>
          <p className="t-small text-muted">{demo ? JUDGE_DEMO_LABEL : "Mint bars are USD PayPal has marked paid."}</p>
          <div className="mt-6">
            <BarStrip bars={dailyBars(real)} />
          </div>
        </article>
        <article className="card-dark flex flex-col p-6">
          <p className="text-sm text-[#9a9ea8]">Collected of everything billed</p>
          <p className="mt-2 text-5xl">
            {Math.round(ratio * 100)}
            <span className="text-[#6b6f78]">%</span>
          </p>
          <div className="mt-auto pt-4">
            <ArcGauge ratio={ratio} />
            <Link href="/inbox" className="btn btn-mint btn-small mt-4">Ingest a request ↗</Link>
          </div>
        </article>
      </section>
    </Shell>
  );
}
