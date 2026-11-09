import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PayLink — PayPal invoicing agent",
  description: "An invoicing and collections agent for freelancers. Drafts, sends, and chases PayPal invoices.",
};

const themeScript = `try{var t=localStorage.getItem('paylink-theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
