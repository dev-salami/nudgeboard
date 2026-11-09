"use client";

import { formatLongDate } from "@181hacks/paylink-core";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Money } from "./keel";
import type { PaidVia, PaypalInvoice } from "@/lib/types";

type Step = 1 | 2 | 3;

export function PayFlow({ invoice: initial, merchantName }: { invoice: PaypalInvoice; merchantName: string }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState(initial);
  const [step, setStep] = useState<Step>(initial.status === "paid" ? 3 : 1);
  const [method, setMethod] = useState<PaidVia>("paypal");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sandbox = invoice.payment?.network === "paypal-sandbox";
  const paid = invoice.status === "paid";

  useEffect(() => {
    if (!sandbox || paid || initial.status === "draft") return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/invoices/${initial.id}`);
        if (!response.ok) return;
        const data = await response.json() as { invoice?: PaypalInvoice };
        if (!active || !data.invoice) return;
        setInvoice(data.invoice);
        if (data.invoice.receiptId) router.replace(`/receipts/${data.invoice.receiptId}`);
      } catch { /* Manual check remains available after a connection failure. */ }
    };
    const timer = setInterval(() => { void poll(); }, 15_000);
    void poll();
    return () => { active = false; clearInterval(timer); };
  }, [initial.id, initial.status, sandbox, paid, router]);

  async function pay() {
    setError("");
    setBusy(true);
    try {
      if (sandbox && invoice.payment?.hostedUrl) {
        window.location.href = invoice.payment.hostedUrl;
        return;
      }
      if (sandbox) throw new Error("PayPal's payer link is not available yet. Check PayPal and try again.");
      const response = await fetch(`/api/invoices/${invoice.id}/pay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const data = (await response.json()) as { invoice?: PaypalInvoice; error?: string; receiptId?: string };
      if (!response.ok || !data.invoice) throw new Error(data.error || "Payment did not complete.");
      setInvoice(data.invoice);
      if (data.receiptId || data.invoice.receiptId) {
        router.push(`/receipts/${data.receiptId || data.invoice.receiptId}`);
        return;
      }
      setStep(3);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment did not complete.");
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/sync`, { method: "POST" });
      const data = (await response.json()) as { invoice?: PaypalInvoice; error?: string };
      if (!response.ok || !data.invoice) throw new Error(data.error || "PayPal did not respond.");
      setInvoice(data.invoice);
      if (data.invoice.receiptId) router.push(`/receipts/${data.invoice.receiptId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sync.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="paper pay-card p-5 sm:p-6">
      {invoice.sample ? <p className="mb-3 text-sm text-muted">Demo sample — no real payment</p> : null}
      <ol className="stepper" aria-label="Payment steps">
        <li className={step > 1 || paid ? "done" : step === 1 ? "on" : ""}><span>1</span> Summary</li>
        <li className={step > 2 || paid ? "done" : step === 2 ? "on" : ""}><span>2</span> Method</li>
        <li className={paid ? "done" : step === 3 ? "on" : ""}><span>3</span> Pay</li>
      </ol>

      {invoice.status === "draft" ? (
        <p className="mt-6 text-sm text-muted">This invoice is still a draft. The merchant has not sent it yet.</p>
      ) : null}

      {step === 1 && !paid ? (
        <section className="mt-6">
          <p className="t-micro text-muted">You are paying</p>
          <h1 className="t-h2 mt-1">{merchantName}</h1>
          <p className="t-small mt-2 text-muted">Review the invoice, then choose how to pay. It only takes a minute.</p>
          <p className="num pay-amount mt-6">
            <Money value={invoice.amount} />
          </p>
          <p className="mt-2 text-sm text-muted">USD · PayPal {sandbox ? "sandbox" : "demo"}</p>
          <div className="mt-6 rounded-2xl border border-line">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block font-semibold">{invoice.description}</span>
                <span className="t-small text-muted">Due {formatLongDate(invoice.dueDate)} · {invoice.number}</span>
              </span>
              <span className="num text-xl">
                <Money value={invoice.amount} />
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-line px-4 py-3 font-bold">
              <span>Total</span>
              <span>
                <Money value={invoice.amount} /> USD
              </span>
            </div>
          </div>
          <button type="button" className="btn btn-primary mt-6 w-full" disabled={invoice.status === "draft"} onClick={() => setStep(2)}>
            Continue to payment
          </button>
        </section>
      ) : null}

      {step === 2 && !paid ? (
        <section className="mt-6">
          <p className="t-micro text-muted">Step 2 of 3</p>
          <h1 className="t-h2 mt-1">How would you like to pay?</h1>
          <p className="t-small mt-2 text-muted">Both methods settle through PayPal. You can switch before you pay.</p>
          <div className="mt-4 grid gap-2">
            <button type="button" className={`method ${method === "paypal" ? "on" : ""}`} onClick={() => setMethod("paypal")}>
              <span className="block font-semibold">PayPal balance</span>
              <span className="t-small text-muted">The PayPal hosted invoice, in the sandbox or the demo checkout.</span>
            </button>
            <button type="button" className={`method ${method === "card" ? "on" : ""}`} onClick={() => setMethod("card")}>
              <span className="block font-semibold">Debit or credit card</span>
              <span className="t-small text-muted">Guest card checkout on the PayPal invoice. No card number is typed here.</span>
            </button>
          </div>
          <div className="mt-6 flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="btn btn-primary flex-1" onClick={() => setStep(3)}>Continue</button>
          </div>
        </section>
      ) : null}

      {step === 3 || paid ? (
        <section className="mt-6">
          <p className="t-micro text-muted">{paid ? "Paid" : "Step 3 of 3"}</p>
          <h1 className="t-h2 mt-1">{paid ? "This invoice is paid" : method === "card" ? "Card via PayPal" : "PayPal"}</h1>
          <p className="num mt-4 text-5xl">
            <Money value={invoice.amount} />
          </p>
          <p className="mt-2 text-sm text-muted">{invoice.number} · {invoice.description}</p>
          {sandbox ? (
            <p className="mt-4 text-sm text-muted">
              You will finish on PayPal&apos;s hosted invoice. Come back and check the payment so the merchant&apos;s books update.
            </p>
          ) : (
            <div className="card mt-4 p-4">
              <p className="text-sm text-muted">Demo checkout</p>
              <p className="mt-1">{method === "card" ? "Visa ···· 4242" : "PayPal balance · sandbox buyer"}</p>
              <p className="mt-2 text-sm text-muted">Nothing is charged. This records a simulated PayPal capture and writes the receipt.</p>
            </div>
          )}
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          <div className="mt-6 grid gap-2">
            {paid && invoice.receiptId ? (
              <button type="button" className="btn btn-mint w-full" onClick={() => router.push(`/receipts/${invoice.receiptId}`)}>
                View receipt
              </button>
            ) : (
              <button type="button" className="btn btn-mint w-full" disabled={busy || invoice.status === "draft"} onClick={() => void pay()}>
                {busy ? "Contacting PayPal…" : sandbox ? "Continue to PayPal" : `Pay ${invoice.amount} USD`}
              </button>
            )}
            {sandbox && !paid ? (
              <button type="button" className="btn btn-ghost w-full" disabled={busy} onClick={() => void sync()}>
                I&apos;ve paid — check PayPal
              </button>
            ) : null}
            {!paid && step === 3 ? (
              <button type="button" className="btn btn-ghost w-full" onClick={() => setStep(2)}>
                Change method
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </article>
  );
}
