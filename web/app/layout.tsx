import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";

const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "FairTix - fair on-chain ticketing",
  description: "Primary sales via card, fair resale with artist royalties, instant organizer payouts.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body className="min-h-screen font-sans">
        <Providers>
          <Header />
          <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-12">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500">
            FairTix demo · test mode: no real money moves · tickets are NFTs on a public testnet.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
