import Link from "next/link";
import { CollectionsQueue } from "@/components/collections-queue";
import { ArcGauge, BarStrip, type Bar } from "@/components/keel";
import { DashboardLive } from "@/components/dashboard-live";
import { Shell } from "@/components/shell";
import { paypalMode } from "@/lib/env";
import { formatUsd } from "@/lib/money";
import { modeInvoices } from "@/lib/ledger";
import { getDb } from "@/lib/store";
import type { PaypalInvoice } from "@/lib/types";

export const dynamic = "force-dynamic";

function dailyBars(invoices: PaypalInvoice[]): Bar[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bars: Bar[] = [];
  for (let i = 23; i >= 0; i -= 1) {
    const start = today.getTime() - i * 86400000;
    const end = start + 86400000;
    const paid = invoices
      .filter((invoice) => invoice.status === "paid" && invoice.paidAt && new Date(invoice.paidAt).getTime() >= start && new Date(invoice.paidAt).getTime() < end)
      .reduce((total, invoice) => total + Number(invoice.amountReceived || invoice.amount), 0);
    bars.push({ value: paid, on: paid > 0 });
  }
  const best = bars.reduce((winner, bar, index) => (bar.value > (bars[winner]?.value ?? 0) ? index : winner), 0);
  const chosen = bars[best];
  if (chosen && chosen.value > 0) chosen.label = { top: formatUsd(chosen.value), sub: "Received" };
  return bars;
}

export default function DashboardPage() {
  const db = getDb();
  const mode = paypalMode();
  const rows = modeInvoices(db.invoices, mode);
  const real = rows.filter((invoice) => !invoice.sample && invoice.status !== "draft" && !["CANCELLED", "REFUNDED"].includes(invoice.paypalStatus || ""));
  const billed = real.reduce((total, invoice) => total + Number(invoice.amount), 0);
  const collected = real.filter((invoice) => invoice.status === "paid").reduce((total, invoice) => total + Number(invoice.amountReceived || invoice.amount), 0);
  const ratio = billed > 0 ? collected / billed : 0;

  return (
    <Shell merchantName={db.merchant.name}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted">{mode === "sandbox" ? "PayPal sandbox" : "Demo mode — PayPal credentials are unset"}</p>
        <Link href="/chat" className="btn btn-primary px-5">+ New invoice</Link>
      </div>
      <CollectionsQueue invoices={rows} />
      <DashboardLive initial={rows} />
      <section className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <article className="card p-6">
          <h2 className="text-xl">Collections, last 24 days</h2>
          <p className="t-small text-muted">Mint bars are USD PayPal has marked paid.</p>
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
