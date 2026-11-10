import Link from "next/link";
import { notFound } from "next/navigation";
import { PayFlow } from "@/components/pay-flow";
import { ThemeToggle } from "@/components/theme-toggle";
import { findInvoice } from "@/lib/invoices";
import { getDb } from "@/lib/store";
import { PRODUCT_NAME, PRODUCT_MARK } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = findInvoice(id);
  if (!invoice) notFound();
  const merchant = getDb().merchant;
  return (
    <div className="pay-shell bg-bg">
      <div className="w-full max-w-[440px]">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="k-logo text-sm" aria-label={`${PRODUCT_NAME} home`}>{PRODUCT_MARK}</Link>
          <ThemeToggle />
        </div>
        <PayFlow invoice={invoice} merchantName={merchant.name} />
        <p className="mt-4 text-center text-xs text-muted">PayPal hosted checkout · {invoice.payment?.network === "paypal-sandbox" ? "sandbox" : "demo"}</p>
        {invoice.status !== "draft" ? <p className="mt-3 text-center text-xs"><Link href={`/api/invoices/${invoice.id}/agent`}>Machine-readable invoice (JSON)</Link></p> : null}
      </div>
    </div>
  );
}
