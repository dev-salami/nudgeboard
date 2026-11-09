"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActionConfirmation } from "@/lib/types";
import { ConfirmationPreview } from "./confirmation-preview";

export function InvoiceActions({ id, status, paypalStatus, demo = false, initialConfirmation }: { id: string; status: string; paypalStatus?: string; demo?: boolean; initialConfirmation?: ActionConfirmation }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmation, setConfirmation] = useState<ActionConfirmation | undefined>(initialConfirmation);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const open = ["pending", "expired", "underpaid"].includes(status) && !["CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED", "PAYMENT_PENDING", "PAID", "MARKED_AS_PAID"].includes(paypalStatus || "");
  const refundable = ["PAID", "MARKED_AS_PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"].includes(paypalStatus || "");

  async function prepare(action: "writeoff" | "record-payment" | "record-refund") {
    setBusy(action); setNote("");
    try {
      const response = await fetch(`/api/invoices/${id}/actions${demo ? "?books=demo" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, input: { amount, date, method, note: reference } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setConfirmation(data.confirmation);
    } catch (error) { setNote(error instanceof Error ? error.message : "Preview failed."); }
    finally { setBusy(""); }
  }

  async function run(action: "send" | "remind" | "sync") {
    setBusy(action);
    setNote("");
    try {
      const response = await fetch(demo ? `/api/invoices/${id}/actions?books=demo` : `/api/invoices/${id}/${action}`, demo ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) } : { method: "POST" });
      const data = (await response.json()) as { error?: string; message?: string; confirmation?: ActionConfirmation };
      if (!response.ok) throw new Error(data.error || "PayPal did not accept that.");
      setNote(data.message || "Updated.");
      if (data.confirmation) setConfirmation(data.confirmation);
      router.refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Something failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {status === "draft" ? (
        <button type="button" className="btn btn-primary" disabled={busy !== ""} onClick={() => void run("send")}>
          {busy === "send" ? "Preparing…" : "Preview invoice send"}
        </button>
      ) : null}
      {open ? (
        <button type="button" className="btn btn-primary" disabled={busy !== ""} onClick={() => void run("remind")}>
          {busy === "remind" ? "Preparing…" : "Preview reminder"}
        </button>
      ) : null}
      <button type="button" className="btn btn-ghost" disabled={busy !== ""} onClick={() => void run("sync")}>
        {busy === "sync" ? "Checking…" : "Sync from PayPal"}
      </button>
      {open ? <button className="btn btn-ghost" disabled={busy !== ""} onClick={() => void prepare("writeoff")}>Write off (cancel in PayPal)</button> : null}
      {open || refundable ? <fieldset className="mt-4 grid w-full gap-3 rounded-xl border border-line p-4">
        <legend>Record an external transaction</legend>
        <p className="text-sm text-muted">Records a payment or refund already made outside PayPal. This does not move funds.</p>
        <label>Amount (USD)<input className="input block w-full" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label>Date<input className="input block w-full" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Method<select className="input block w-full" value={method} onChange={(e) => setMethod(e.target.value)}><option value="BANK_TRANSFER">Bank transfer</option><option value="CASH">Cash</option><option value="OTHER">Other</option></select></label>
        <label>External reference / note<input className="input block w-full" value={reference} onChange={(e) => setReference(e.target.value)} /></label>
        {open ? <button className="btn btn-ghost" disabled={busy !== ""} onClick={() => void prepare("record-payment")}>Preview recorded partial payment</button> : null}
        {refundable ? <button className="btn btn-ghost" disabled={busy !== ""} onClick={() => void prepare("record-refund")}>Preview recorded refund</button> : null}
      </fieldset> : null}
      {note ? <p className="w-full text-sm text-muted">{note}</p> : null}
      {confirmation ? <ConfirmationPreview key={confirmation.id} confirmation={confirmation} demo={demo} /> : null}
    </div>
  );
}
