import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sans = localFont({
  src: "./fonts/DegularDisplay-Regular.ttf",
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "PayLink — PayPal invoicing agent",
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
