import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { PRODUCT_NAME, PRODUCT_DESCRIPTOR } from "@/lib/brand";

const sans = localFont({
  src: "./fonts/InstrumentSans-Variable.ttf",
  display: "swap",
  variable: "--font-sans",
  weight: "400 700",
});

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — ${PRODUCT_DESCRIPTOR}`,
  description: "An invoicing and collections agent for freelancers. Drafts, sends, and chases PayPal invoices.",
};

const themeScript = `try{var t=localStorage.getItem('paylink-theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
