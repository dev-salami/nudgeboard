import Link from "next/link";
import { notFound } from "next/navigation";
import { formatLongDate } from "@181hacks/paylink-core";
import { InvoiceActions } from "@/components/invoice-actions";
import { Money } from "@/components/keel";
import { Shell } from "@/components/shell";
import { StatusPill } from "@/components/status-pill";
import { findInvoice } from "@/lib/invoices";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = findInvoice(id);
  if (!invoice) notFound();
  const merchant = getDb().merchant;
  return (
    <Shell merchantName={merchant.name}>
      <article className="paper mx-auto max-w-xl p-6 sm:p-8">
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
          <Row label="Network" value={invoice.payment?.network === "paypal-sandbox" ? "Sandbox" : "Demo"} />
        </dl>
        <InvoiceActions id={invoice.id} status={invoice.status} initialConfirmation={getDb().confirmations.filter((row) => row.invoiceId === invoice.id && ["pending", "executing", "uncertain"].includes(row.state)).at(-1)} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="btn btn-ghost btn-small" href={`/pay/${invoice.id}`}>Payer page</Link>
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
