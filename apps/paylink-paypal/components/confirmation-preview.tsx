"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionConfirmation, PaypalInvoice } from "@/lib/types";

export function ConfirmationPreview({ confirmation, onInvoice, demo = false }: { confirmation: ActionConfirmation; onInvoice?: (invoice: PaypalInvoice) => void; demo?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState(confirmation.state);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const preview = confirmation.preview;
  async function decide(decision: "confirm" | "cancel") {
    if (busy || state !== "pending") return;
    setBusy(true);
    try {
      const response = await fetch(`/api/confirmations/${confirmation.id}${demo ? "?books=demo" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, invoiceId: confirmation.invoiceId, action: confirmation.action }) });
      const data = await response.json();
      if (data.confirmation) setState(data.confirmation.state);
      if (data.invoice) onInvoice?.(data.invoice);
      setNote(data.error || data.message || "Check the invoice before retrying.");
      router.refresh();
    } catch {
      // Transport uncertainty must not become a fresh send token. Retrying the
      // SAME token is safe server-side, but pause the UI for operator review.
      setState("uncertain");
      setNote("Response unavailable. Do not create another send. Check the invoice and PayPal; the same confirmation cannot dispatch twice.");
    } finally { setBusy(false); }
  }
  return <section className="mt-3 w-full min-w-0 rounded-2xl border border-line bg-elev p-4 text-ink" aria-label="Action preview">
    <p className="text-sm text-muted">{confirmation.mode === "sandbox" ? "PayPal sandbox — test funds only" : "Demo — no real PayPal send"} · {state}</p>
    <h2 className="mt-2 text-lg">{confirmation.action === "send" ? "Invoice send preview" : confirmation.action === "remind" ? "Reminder preview" : `${confirmation.action} preview`}</h2>
    <dl className="mt-3 grid gap-2 break-words text-sm">
      <div><dt>Invoice</dt><dd>{preview.number} · {preview.clientName}</dd></div>
      <div><dt>Recipient</dt><dd>{preview.clientEmail || "No email — demo log only"}</dd></div>
      <div><dt>Amount</dt><dd>{preview.amount} {preview.currency}</dd></div>
      <div><dt>Description / due date</dt><dd>{preview.description} · {preview.dueDate}</dd></div>
      <div><dt>Exact message</dt><dd className="whitespace-pre-wrap">{preview.message}</dd></div>
    </dl>
    <p className="mt-3 text-xs text-muted">Nothing is sent by a preview. Confirm only this action and invoice. Expires {confirmation.expiresAt} (UTC). Payment state is rechecked before dispatch.</p>
    {state === "pending" ? <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void decide("confirm")}>{busy ? "Checking…" : confirmation.action === "send" ? "Confirm invoice send" : confirmation.action === "remind" ? "Confirm reminder send" : `Confirm ${confirmation.action}`}</button>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void decide("cancel")}>Cancel preview</button>
    </div> : null}
    {note ? <p role="status" className="mt-3 break-words text-sm">{note}</p> : null}
  </section>;
}
