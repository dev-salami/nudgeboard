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

const title = `${PRODUCT_NAME} — ${PRODUCT_DESCRIPTOR}`;
const description = `${PRODUCT_NAME} — ${PRODUCT_DESCRIPTOR}. Draft invoices, review payer-aware proposals, and confirm each PayPal action.`;

export const metadata: Metadata = {
  title,
  description,
  openGraph: { type: "website", title, description, siteName: PRODUCT_NAME },
  twitter: { card: "summary", title, description },
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
