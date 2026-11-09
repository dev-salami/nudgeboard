"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { PRODUCT_NAME, PRODUCT_MARK } from "@/lib/brand";

const tabs = [
  { href: "/dashboard", label: "Queue", match: (path: string) => path === "/dashboard" },
  { href: "/dashboard?view=invoices", label: "Invoices", match: (path: string) => path.startsWith("/invoices") },
  { href: "/chat", label: "Agent", match: (path: string) => path.startsWith("/chat") },
  { href: "/inbox", label: "Inbox", match: (path: string) => path.startsWith("/inbox") },
];

export function Shell({ children, merchantName = "Amaka Studio" }: { children: React.ReactNode; merchantName?: string }) {
  const pathname = usePathname();
  const initials = merchantName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="min-h-screen bg-bg">
      <header className="k-top">
        <Link href="/dashboard" className="k-logo" aria-label={`${PRODUCT_NAME} home`}>
          {PRODUCT_MARK}
        </Link>
        <span className="hidden flex-1 lg:block" />
        <nav className="k-tabs" aria-label="Sections">
          {tabs.map((tab) => (
            <Link key={tab.label} href={tab.href} className="k-tab" aria-current={tab.match(pathname) ? "page" : undefined}>
              {tab.label}
            </Link>
          ))}
        </nav>
        <span className="flex-1 lg:hidden" />
        <div className="flex items-center gap-2">
          <span className="k-avatar" title={merchantName}>
            {initials}
          </span>
          <ThemeToggle />
        </div>
      </header>
      <main className="k-content">{children}</main>
    </div>
  );
}
