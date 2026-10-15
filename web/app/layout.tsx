import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";

const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "FairTix - fair on-chain ticketing",
  description: "Primary sales via card, fair resale with artist royalties, instant organizer payouts.",
};

const clerkOn = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const clerkLook = { variables: { colorPrimary: "#4a7bd6", colorBackground: "#111113", colorText: "#fafafa", colorTextOnPrimaryBackground: "#ffffff", colorInputBackground: "#09090b", colorInputText: "#fafafa", colorTextSecondary: "#a1a1aa" },
  elements: {
    // Clerk's default dark-on-dark made the Google button unreadable: use a light button with dark text.
    socialButtonsBlockButton: { backgroundColor: "#fafafa", border: "1px solid #fafafa" },
    socialButtonsBlockButtonText: { color: "#09090b", fontWeight: 600 },
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const page = (
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
  return clerkOn ? <ClerkProvider appearance={clerkLook}>{page}</ClerkProvider> : page;
}
