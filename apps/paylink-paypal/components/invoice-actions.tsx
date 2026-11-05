"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function InvoiceActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  async function run(action: "send" | "remind" | "sync") {
    setBusy(action);
    setNote("");
    try {
      const response = await fetch(`/api/invoices/${id}/${action}`, { method: "POST" });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || "PayPal did not accept that.");
      setNote(data.message || "Updated.");
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
          {busy === "send" ? "Sending…" : "Send with PayPal"}
        </button>
      ) : null}
      {status === "pending" || status === "expired" || status === "underpaid" ? (
        <button type="button" className="btn btn-primary" disabled={busy !== ""} onClick={() => void run("remind")}>
          {busy === "remind" ? "Chasing…" : "Send reminder"}
        </button>
      ) : null}
      <button type="button" className="btn btn-ghost" disabled={busy !== ""} onClick={() => void run("sync")}>
        {busy === "sync" ? "Checking…" : "Sync from PayPal"}
      </button>
      {note ? <p className="w-full text-sm text-muted">{note}</p> : null}
    </div>
  );
}
