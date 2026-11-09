"use client";

import { useState } from "react";
import { collectionsQueue } from "@/lib/collections-queue";
import type { ActionConfirmation, PaypalInvoice } from "@/lib/types";
import { statusEvidence } from "@/lib/evidence";

type Prepared = { invoiceId: string; proposal?: { reason: string; action: string }; confirmation?: ActionConfirmation; error?: string; result?: string };

export function CollectionsQueue({ invoices, demo = false, onInvoice }: { invoices: PaypalInvoice[]; demo?: boolean; onInvoice?: (invoice: PaypalInvoice) => void }) {
  const queue = collectionsQueue(invoices);
  const [selected, setSelected] = useState(queue.map((row) => row.invoiceId));
  const [prepared, setPrepared] = useState<Prepared[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function approve() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/collections${demo ? "?books=demo" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceIds: selected }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPrepared(data.results);
    } catch (e) { setError(e instanceof Error ? e.message : "Preview unavailable."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true);
    for (const row of prepared.filter((row) => row.confirmation?.state === "pending" && !row.result)) {
      const c = row.confirmation!;
      try {
        const response = await fetch(`/api/confirmations/${c.id}${demo ? "?books=demo" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "confirm", invoiceId: c.invoiceId, action: c.action }) });
        const data = await response.json();
        if (data.invoice) onInvoice?.(data.invoice);
        row.result = data.error || data.refusal || data.message;
        c.state = data.confirmation?.state || "uncertain";
      } catch { row.result = "Response unavailable — check PayPal; do not repeat."; c.state = "uncertain"; }
      setPrepared([...prepared]);
    }
    setBusy(false);
  }
  const pending = prepared.filter((row) => row.confirmation?.state === "pending" && !row.result).length;
  return <section className="card mb-6 p-6" aria-label="Collections queue">
    <h1 className="text-3xl">Collections queue</h1>
    <p className="mt-2 text-sm text-muted">Overdue first, then remaining balance. Approval prepares previews only.</p>
    {queue.map((row) => <article key={row.invoiceId} className="mt-4 border-t border-line pt-4">
      <label className="flex gap-3"><input type="checkbox" checked={selected.includes(row.invoiceId)} disabled={busy} onChange={(e) => setSelected(e.target.checked ? [...selected, row.invoiceId] : selected.filter((id) => id !== row.invoiceId))} />
        <span>{row.invoice.number} · {row.invoice.clientName} · {row.remaining.toFixed(2)} USD — {row.action === "writeoff" ? "Write off (cancel in PayPal)" : row.action}</span></label>
      <p className="mt-2 text-sm">{row.reason} · {row.tone}</p>
      <p className="break-all text-xs text-muted">{statusEvidence(row.invoice)}</p>
      {row.invoice.lastRemindedAt ? <p className="text-xs text-muted">Last reminder: {row.invoice.lastRemindedAt}</p> : null}
    </article>)}
    {!queue.length ? <p className="mt-4">No open invoices.</p> : <button className="btn btn-primary mt-5" disabled={busy || !selected.length} onClick={() => void approve()}>Approve selected</button>}
    {prepared.map((row) => <article className="mt-4 rounded-xl bg-elev p-4" key={row.invoiceId}>
      <p>{row.confirmation?.preview.number || row.invoiceId} · {row.proposal?.action}</p><p>{row.proposal?.reason}</p>
      <p className="mt-2 whitespace-pre-wrap">{row.confirmation?.preview.message}</p>
      <p role="status">{row.error || row.result || row.confirmation?.state}</p>
    </article>)}
    {pending > 0 ? <button className="btn btn-mint mt-4" disabled={busy} onClick={() => void confirm()}>Confirm and send {pending} actions</button> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
