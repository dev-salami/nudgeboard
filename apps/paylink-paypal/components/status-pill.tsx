import type { InvoiceStatus } from "@181hacks/paylink-core";

const copy: Record<InvoiceStatus, string> = {
  draft: "Draft",
  pending: "Awaiting",
  paid: "Paid",
  underpaid: "Underpaid",
  expired: "Expired",
};

export function StatusPill({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`pill ${status}`}>
      <i />
      {copy[status]}
    </span>
  );
}
