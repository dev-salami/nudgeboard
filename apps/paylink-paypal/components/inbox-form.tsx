"use client";

import Link from "next/link";
import { useState } from "react";
import type { PaypalInvoice } from "@/lib/types";

const samples = {
  email: `From: Ada Lovelace <ada@example.com>
Subject: Spring logo

Hi Amaka — please invoice 480 USD for the logo system, due Friday.`,
  whatsapp: "Kola Adeyemi: hey can you send the invoice for the brand workshop, 160 usd, due tomorrow. kola@studio.example",
};

export function InboxForm() {
  const [email, setEmail] = useState(samples.email);
  const [whatsapp, setWhatsapp] = useState(samples.whatsapp);
  const [busy, setBusy] = useState<"email" | "whatsapp" | null>(null);
  const [note, setNote] = useState("");
  const [invoice, setInvoice] = useState<PaypalInvoice | null>(null);

  async function submit(channel: "email" | "whatsapp") {
    setBusy(channel);
    setNote("");
    try {
      const response = await fetch("/api/inbox", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, raw: channel === "email" ? email : whatsapp }),
      });
      const data = (await response.json()) as { invoice?: PaypalInvoice; error?: string; reply?: string };
      if (!response.ok) throw new Error(data.error || "Could not read that message.");
      setInvoice(data.invoice ?? null);
      setNote(data.reply || "Saved.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not read that message.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form
        className="card p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit("email");
        }}
      >
        <p className="t-micro text-muted">Email</p>
        <h2 className="mt-2 text-2xl">Paste a request</h2>
        <textarea className="field mt-4" value={email} onChange={(event) => setEmail(event.target.value)} />
        <button className="btn btn-primary mt-3" type="submit" disabled={busy !== null}>
          {busy === "email" ? "Reading…" : "Create PayPal invoice"}
        </button>
      </form>
      <form
        className="card p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit("whatsapp");
        }}
      >
        <p className="t-micro text-muted">WhatsApp</p>
        <h2 className="mt-2 text-2xl">Paste a chat</h2>
        <textarea className="field mt-4" value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} />
        <button className="btn btn-primary mt-3" type="submit" disabled={busy !== null}>
          {busy === "whatsapp" ? "Reading…" : "Create PayPal invoice"}
        </button>
      </form>
      {note ? (
        <div className="card-dark p-5 lg:col-span-2">
          <p>{note}</p>
          {invoice ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="btn btn-mint btn-small" href={`/pay/${invoice.id}`}>Open pay link</Link>
              <Link className="btn btn-ghost btn-small" href={`/invoices/${invoice.id}`} style={{ background: "transparent", color: "#f4f5f7", borderColor: "#313744" }}>
                Merchant invoice
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
