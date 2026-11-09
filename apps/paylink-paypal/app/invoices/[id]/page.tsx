import Link from "next/link";
import { notFound } from "next/navigation";
import { formatLongDate } from "@181hacks/paylink-core";
import { InvoiceActions } from "@/components/invoice-actions";
import { Money } from "@/components/keel";
import { Shell } from "@/components/shell";
import { StatusPill } from "@/components/status-pill";
import { findInvoice } from "@/lib/invoices";
import { getDb } from "@/lib/store";
import { withJudgeDemo } from "@/lib/judge-demo-context";
import { JUDGE_DEMO_LABEL } from "@/lib/judge-demo-seed";
import { balance } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ books?: string }> }) {
  const { id } = await params;
  const demo = (await searchParams).books === "demo";
  return demo ? withJudgeDemo(() => renderInvoice(id, true)) : renderInvoice(id, false);
}

function renderInvoice(id: string, demo: boolean) {
  const invoice = findInvoice(id);
  if (!invoice) notFound();
  const merchant = getDb().merchant;
  return (
    <Shell merchantName={merchant.name}>
      <article className="paper mx-auto max-w-xl p-6 sm:p-8">
        {invoice.sample ? <p className="mb-3 text-sm text-muted">{JUDGE_DEMO_LABEL}</p> : null}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="t-micro text-muted">{merchant.name}</p>
            <h1 className="mt-2 text-3xl">{invoice.number}</h1>
          </div>
          <StatusPill status={invoice.status} />
        </div>
        <p className="num mt-6 text-6xl">
          <Money value={invoice.amount} />
        </p>
        <p className="text-sm text-muted">USD</p>
        <dl className="mt-6 grid gap-3 text-sm">
          <Row label="Bill to" value={invoice.clientName} />
          <Row label="Email" value={invoice.clientEmail || "—"} />
          <Row label="For" value={invoice.description} />
          <Row label="Due" value={formatLongDate(invoice.dueDate)} />
          <Row label="PayPal" value={invoice.payment?.reference || "Not created"} />
          <Row label="PayPal status" value={invoice.paypalStatus || "Not created"} />
          <Row label="Received / remaining" value={`${invoice.amountReceived || "0.00"} / ${balance(invoice).toFixed(2)} USD`} />
          {invoice.amountRefunded ? <Row label="Refund recorded" value={`${invoice.amountRefunded} USD · ${invoice.recordedRefundId || "PayPal GET"}`} /> : null}
          <Row label="Network" value={invoice.payment?.network === "paypal-sandbox" ? "Sandbox" : "Demo"} />
        </dl>
        <InvoiceActions id={invoice.id} status={invoice.status} paypalStatus={invoice.paypalStatus} demo={demo} initialConfirmation={getDb().confirmations.filter((row) => row.invoiceId === invoice.id && ["pending", "executing", "uncertain"].includes(row.state)).at(-1)} />
        <div className="mt-4 flex flex-wrap gap-2">
          {!demo ? <Link className="btn btn-ghost btn-small" href={`/pay/${invoice.id}`}>Payer page</Link> : null}
          {invoice.receiptId ? <Link className="btn btn-mint btn-small" href={`/receipts/${invoice.receiptId}`}>Receipt</Link> : null}
        </div>
      </article>
    </Shell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-line pt-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
