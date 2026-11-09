import Link from "next/link";
import { notFound } from "next/navigation";
import { formatLongDate } from "@181hacks/paylink-core";
import { Money } from "@/components/keel";
import { getDb } from "@/lib/store";
import { withJudgeDemo } from "@/lib/judge-demo-context";
import { JUDGE_DEMO_LABEL } from "@/lib/judge-demo-seed";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ books?: string }> }) {
  const { id } = await params;
  const demo = (await searchParams).books === "demo";
  return demo ? withJudgeDemo(() => renderReceipt(id, true)) : renderReceipt(id, false);
}

function renderReceipt(id: string, demo: boolean) {
  const receipt = getDb().receipts.find((item) => item.id === id);
  if (!receipt) notFound();
  const paidDay = receipt.paidAt.slice(0, 10);
  return (
    <div className="pay-shell bg-bg">
      <article className="paper pay-card p-6 sm:p-8">
        <span className="paid-seal">Paid</span>
        {receipt.sample ? <p className="mt-2 text-sm text-muted">{JUDGE_DEMO_LABEL}</p> : null}
        <p className="t-micro mt-6 text-muted">Receipt {receipt.number}</p>
        <h1 className="mt-2 text-3xl">{receipt.merchantName}</h1>
        <p className="num pay-amount mt-4">
          <Money value={receipt.amount} />
        </p>
        <p className="text-sm text-muted">USD · {receipt.paidVia === "card" ? "Card via PayPal" : "PayPal"}</p>
        <dl className="mt-6 grid gap-3 text-sm">
          <div className="flex justify-between gap-4 border-t border-line pt-3">
            <dt className="text-muted">Paid by</dt>
            <dd>{receipt.clientName}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-3">
            <dt className="text-muted">For</dt>
            <dd className="text-right">{receipt.description}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-3">
            <dt className="text-muted">Date</dt>
            <dd>{formatLongDate(paidDay)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-3">
            <dt className="text-muted">PayPal</dt>
            <dd className="text-right">{receipt.paypalInvoiceId ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-3">
            <dt className="text-muted">Transaction</dt>
            <dd className="text-right">{receipt.transactionId ?? "—"}</dd>
          </div>
        </dl>
        <p className="mt-4 break-all text-sm text-muted">{receipt.lastPaypalEventId ? `${receipt.paypalInvoiceId?.startsWith("DEMO-") ? "Demo webhook" : "PayPal webhook"}: ${receipt.lastPaypalEventId}` : "No webhook id — payment reconciled without a webhook"}</p>
        <Link href={demo ? "/dashboard?books=demo" : "/dashboard"} className="btn btn-primary mt-8 w-full">Back to the books</Link>
      </article>
    </div>
  );
}
