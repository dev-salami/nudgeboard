"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActionConfirmation } from "@/lib/types";
import { ConfirmationPreview } from "./confirmation-preview";

export function InvoiceActions({ id, status, initialConfirmation }: { id: string; status: string; initialConfirmation?: ActionConfirmation }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmation, setConfirmation] = useState<ActionConfirmation | undefined>(initialConfirmation);

  async function run(action: "send" | "remind" | "sync") {
    setBusy(action);
    setNote("");
    try {
      const response = await fetch(`/api/invoices/${id}/${action}`, { method: "POST" });
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
      {status === "pending" || status === "expired" || status === "underpaid" ? (
        <button type="button" className="btn btn-primary" disabled={busy !== ""} onClick={() => void run("remind")}>
          {busy === "remind" ? "Preparing…" : "Preview reminder"}
        </button>
      ) : null}
      <button type="button" className="btn btn-ghost" disabled={busy !== ""} onClick={() => void run("sync")}>
        {busy === "sync" ? "Checking…" : "Sync from PayPal"}
      </button>
      {note ? <p className="w-full text-sm text-muted">{note}</p> : null}
      {confirmation ? <ConfirmationPreview key={confirmation.id} confirmation={confirmation} /> : null}
    </div>
  );
}
