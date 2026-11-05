import Link from "next/link";
import type { InvoiceStatus } from "@181hacks/paylink-core";
import { MarbleMark, Money } from "@/components/keel";
import { StatusPill } from "@/components/status-pill";
import { ThemeToggle } from "@/components/theme-toggle";

export const dynamic = "force-dynamic";

const sampleRows: { clientName: string; number: string; amount: string; status: InvoiceStatus }[] = [
  { clientName: "Harbour & Co", number: "PP-SAMPLE-01", amount: "480", status: "paid" },
  { clientName: "Northwind", number: "PP-SAMPLE-02", amount: "220", status: "pending" },
  { clientName: "Studio Mina", number: "PP-SAMPLE-03", amount: "90", status: "underpaid" },
  { clientName: "Kola Adeyemi", number: "PP-SAMPLE-04", amount: "160", status: "expired" },
];

const steps = [
  { n: "01", title: "A job lands", body: "Paste the email or the WhatsApp note. The agent reads the client, the amount, and the due date." },
  { n: "02", title: "PayPal sends it", body: "PayLink creates a PayPal invoice and sends the hosted pay link. Sandbox when keys are set, demo when they are not." },
  { n: "03", title: "It gets chased", body: "Open invoices get a reminder. When PayPal reports the capture, the receipt writes itself." },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-3 z-30 mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-3">
        <Link href="/" className="flex items-center gap-2 text-lg">
          <span className="k-logo h-9 w-9 text-sm">P</span>
          <span className="bold hidden sm:inline">PayLink</span>
        </Link>
        <nav className="hidden items-center gap-1 rounded-2xl bg-paper p-1.5 text-sm md:flex" aria-label="Site">
          <a className="rounded-xl px-4 py-2 hover:bg-elev" href="#product">Product</a>
          <a className="rounded-xl px-4 py-2 hover:bg-elev" href="#how">How it works</a>
          <a className="rounded-xl px-4 py-2 hover:bg-elev" href="#books">Books</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/dashboard" className="btn btn-primary btn-small px-5">Open the books</Link>
        </div>
      </header>

      <section id="product" className="mx-auto grid max-w-6xl items-center gap-8 px-5 pb-8 pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:pt-16">
        <div>
          <span className="eyebrow">PayPal invoicing · collections agent</span>
          <h1 className="t-display mt-5">
            Get paid in USD <span className="bold">without chasing</span> the invoice yourself.
          </h1>
          <ul className="checks mt-7 grid gap-2.5 text-muted">
            <li>Invoices from a sentence, an email, or a WhatsApp note</li>
            <li>PayPal creates the invoice and hosts the checkout</li>
            <li>Reminders go out, and the receipt lands when PayPal says paid</li>
          </ul>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/chat" className="btn btn-primary px-6">Try the agent ↗</Link>
            <Link href="/pay/inv_demo_northwind" className="btn btn-ghost px-6">Preview a pay page</Link>
          </div>
        </div>
        <div className="relative">
          <MarbleMark />
          <div className="card absolute left-0 top-8 w-[190px] p-4">
            <p className="text-xs text-muted">Received today</p>
            <p className="mt-1 text-2xl"><Money value={480} /></p>
            <span className="delta up mt-2">↑ PayPal paid</span>
          </div>
          <div className="card-dark absolute bottom-6 right-0 w-[210px] p-4">
            <p className="text-xs text-[#9a9ea8]">PayPal invoice</p>
            <p className="mt-1 text-xl">PP-2026-1041</p>
            <p className="mt-1 text-sm"><span className="text-[#71FC8F]">●</span> Sent · awaiting</p>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid gap-3 md:grid-cols-3">
          {steps.map((step) => (
            <article key={step.n} className="card p-6">
              <p className="text-sm text-muted">{step.n}</p>
              <h3 className="mt-8 text-xl">{step.title}</h3>
              <p className="mt-2 text-sm text-muted">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="relative mx-3 overflow-hidden rounded-[28px] bg-[#181C25] px-5 py-16 text-[#f4f5f7] sm:mx-5">
        <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="eyebrow text-[#9a9ea8]">The books</span>
            <h2 className="mt-4 text-[clamp(2.2rem,4.6vw,3.6rem)] leading-[0.98]">
              Every invoice, <span className="bold">reconciled</span> against PayPal.
            </h2>
            <p className="mt-5 max-w-md text-[#9a9ea8]">
              Status changes when PayPal reports the capture, through the webhook or a sync. Demo mode runs the same loop with a simulated checkout.
            </p>
            <Link href="/dashboard" className="btn btn-mint mt-8 px-6">Open the books ↗</Link>
          </div>
          <div className="card-dark p-6">
            <p className="text-sm text-[#9a9ea8]">Agent</p>
            <p className="mt-3 text-2xl leading-snug">“Invoice Ada 480 USD for the logo, due Friday.”</p>
            <p className="mt-4 text-sm text-[#9a9ea8]">PayPal draft, then send, then the hosted pay link.</p>
            <div className="meter mt-6"><span style={{ width: "64%" }} /></div>
          </div>
        </div>
      </section>

      <section id="books" className="relative z-10 mx-auto -mt-10 max-w-5xl px-5 pb-16">
        <div className="card p-3 sm:p-5">
          <div className="flex items-center justify-between px-3 pb-2">
            <p className="flex items-center gap-2 text-lg">Invoices <span className="pill">Sample data</span></p>
            <Link href="/inbox" className="text-sm text-muted">Ingest a request ↗</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="ledger min-w-[560px]">
              <thead>
                <tr><th>Customer</th><th>Number</th><th>Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {sampleRows.map((row) => (
                  <tr key={row.number}>
                    <td>{row.clientName}</td>
                    <td className="text-muted">{row.number}</td>
                    <td><Money value={row.amount} /></td>
                    <td><StatusPill status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <footer className="mx-3 mb-3 rounded-[28px] bg-[#181C25] px-6 pb-8 pt-16 text-[#f4f5f7] sm:mx-5">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-3xl text-[clamp(2.2rem,5vw,4.2rem)] leading-[0.98]">
            Send the PayPal link. <span className="bold">Keep the work moving.</span>
          </h2>
          <Link href="/chat" className="btn btn-mint mt-8 px-6">Start invoicing ↗</Link>
          <div className="mt-16 flex flex-wrap justify-between gap-4 border-t border-[#2c3240] pt-6 text-sm text-[#9a9ea8]">
            <span>PayLink · PayPal sandbox invoicing for the AI hackathon</span>
            <span className="flex gap-5">
              <Link href="/dashboard">Books</Link>
              <Link href="/chat">Agent</Link>
              <Link href="/inbox">Inbox</Link>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
