import Link from "next/link";
import { Money } from "./keel";
import { StatusPill } from "./status-pill";
import type { PaypalInvoice } from "@/lib/types";

export function Ledger({ rows }: { rows: PaypalInvoice[] }) {
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-sm text-muted">No invoices yet. Ask the agent to draft one.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="ledger min-w-[720px]">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Number</th>
            <th>Amount</th>
            <th>PayPal</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((invoice) => (
            <tr key={invoice.id}>
              <td>
                <Link href={`/invoices/${invoice.id}`}>{invoice.clientName}</Link>
                <span className="block text-xs text-muted">{invoice.description}</span>
              </td>
              <td className="text-muted">{invoice.number}</td>
              <td>
                <Money value={invoice.amount} />
              </td>
              <td className="text-muted">{invoice.payment?.reference ?? "—"}</td>
              <td>
                <StatusPill status={invoice.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
