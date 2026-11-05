"use client";

import Link from "next/link";
import { useState } from "react";
import { Money } from "./keel";
import { StatusPill } from "./status-pill";
import type { PaypalInvoice } from "@/lib/types";

interface ChatReply {
  reply: string;
  mode: "demo" | "llm";
  paypal: "demo" | "sandbox";
  invoice?: PaypalInvoice;
  invoices?: PaypalInvoice[];
  link?: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  data?: ChatReply;
}

const prompts = [
  "Invoice Ada Lovelace ada@example.com 480 USD for the spring logo, due Friday",
  "What's unpaid?",
  "Remind Northwind",
];

export function ChatApp() {
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "assistant",
      content: "Tell me who to invoice. I will create the PayPal invoice, send it, and chase it if it sits open.",
    },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    const history = turns.slice(-8).map((turn) => ({ role: turn.role, content: turn.content }));
    setTurns((current) => [...current, { role: "user", content: trimmed }]);
    setText("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });
      const data = (await response.json()) as ChatReply & { error?: string };
      setTurns((current) => [
        ...current,
        { role: "assistant", content: data.reply || data.error || "The agent did not answer.", data },
      ]);
    } catch {
      setTurns((current) => [...current, { role: "assistant", content: "The agent could not be reached." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm text-muted">Collections agent</p>
        <h1 className="text-3xl">Invoice in a sentence.</h1>
      </div>
      <div className="grid gap-3">
        {turns.map((turn, index) => (
          <div key={`${turn.role}-${index}`} className={`bubble ${turn.role}`}>
            <p className="whitespace-pre-wrap">{turn.content}</p>
            {turn.data?.invoice ? <InvoiceCard invoice={turn.data.invoice} /> : null}
            {turn.data?.invoices && turn.data.invoices.length > 1 ? (
              <ul className="mt-3 grid gap-2">
                {turn.data.invoices.slice(0, 6).map((invoice) => (
                  <li key={invoice.id}>
                    <Link href={`/invoices/${invoice.id}`} className="flex items-center justify-between gap-3 text-sm">
                      <span>{invoice.clientName}</span>
                      <StatusPill status={invoice.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <button key={prompt} type="button" className="chip" onClick={() => send(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send(text);
        }}
      >
        <textarea
          className="field"
          style={{ minHeight: 72 }}
          value={text}
          placeholder="Invoice a client, paste an email, or ask who still owes you."
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(text);
            }
          }}
        />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Sending" : "Send"}
        </button>
      </form>
    </div>
  );
}

function InvoiceCard({ invoice }: { invoice: PaypalInvoice }) {
  return (
    <div className="mt-3 rounded-2xl bg-elev p-3 text-ink">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{invoice.number}</p>
          <p className="text-lg">{invoice.clientName}</p>
        </div>
        <StatusPill status={invoice.status} />
      </div>
      <p className="mt-2 text-3xl">
        <Money value={invoice.amount} />
      </p>
      <p className="text-sm text-muted">{invoice.description}</p>
      {invoice.payment?.reference ? <p className="mt-2 text-xs text-muted">PayPal {invoice.payment.reference}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/pay/${invoice.id}`} className="btn btn-mint btn-small">
          Pay link
        </Link>
        <Link href={`/invoices/${invoice.id}`} className="btn btn-ghost btn-small">
          Invoice
        </Link>
      </div>
    </div>
  );
}
