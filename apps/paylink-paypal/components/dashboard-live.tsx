"use client";

import { useEffect, useState } from "react";
import { Delta, Money } from "./keel";
import { Ledger } from "./ledger";
import type { PaypalInvoice } from "@/lib/types";
import { balance, receivable } from "@/lib/ledger";
import { isOpen } from "@/lib/collections-queue";
import { JUDGE_DEMO_LABEL } from "@/lib/judge-demo-seed";

export function DashboardLive({ initial, demo = false }: { initial: PaypalInvoice[]; demo?: boolean }) {
  const [rows, setRows] = useState(initial);

  useEffect(() => {
    if (demo) return;
    const timer = setInterval(() => {
      void fetch("/api/invoices")
        .then((response) => response.json())
        .then((data: { invoices?: PaypalInvoice[] }) => {
          if (data.invoices) setRows(data.invoices);
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [demo]);

  const eligible = (invoice: PaypalInvoice) => demo ? isOpen(invoice) : receivable(invoice);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const received = rows
    .filter((invoice) => (demo || !invoice.sample) && invoice.status === "paid" && invoice.paypalStatus !== "REFUNDED" && invoice.paidAt && new Date(invoice.paidAt) >= monthStart)
    .reduce((total, invoice) => total + Number(invoice.amountReceived || invoice.amount), 0);
  const outstanding = rows
    .filter((invoice) => eligible(invoice) && invoice.status !== "expired")
    .reduce((total, invoice) => total + balance(invoice), 0);
  const collected = rows.filter((invoice) => (demo || !invoice.sample) && invoice.status === "paid" && invoice.paypalStatus !== "REFUNDED").reduce((total, invoice) => total + Number(invoice.amountReceived || invoice.amount), 0);
  const overdue = rows.filter((invoice) => eligible(invoice) && invoice.status === "expired").reduce((total, invoice) => total + balance(invoice), 0);
  const openCount = rows.filter((invoice) => eligible(invoice) && invoice.status !== "expired").length;
  const paidCount = rows.filter((invoice) => (demo || !invoice.sample) && invoice.status === "paid" && invoice.paypalStatus !== "REFUNDED").length;

  return (
    <>
      <section>
        {demo ? <p className="text-sm text-muted">{JUDGE_DEMO_LABEL}</p> : null}
        <p className="text-2xl">Received this month</p>
        <p className="big-num mt-1">
          <Money value={received} />
        </p>
      </section>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile label="Outstanding" value={<Money value={outstanding} />} extra={<Delta tone="flat">{openCount} open</Delta>} />
        <Tile label="Collected" value={<Money value={collected} />} extra={<Delta tone="up">{paidCount} paid</Delta>} />
        <Tile label="Overdue" value={<Money value={overdue} />} extra={<Delta tone={overdue > 0 ? "down" : "flat"}>{rows.filter((invoice) => eligible(invoice) && invoice.status === "expired").length}</Delta>} />
      </section>
      <section className="card mt-3 p-2 sm:p-3">
        <Ledger rows={rows} demo={demo} />
      </section>
    </>
  );
}

function Tile({ label, value, extra }: { label: string; value: React.ReactNode; extra: React.ReactNode }) {
  return (
    <article className="card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-3 text-4xl">{value}</p>
      <div className="mt-3">{extra}</div>
    </article>
  );
}
