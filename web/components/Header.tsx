"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "./Providers";
import type { WalletName } from "@/lib/types";

const links = [
  { href: "/", label: "Buy ticket" },
  { href: "/tickets", label: "My tickets" },
  { href: "/organizer", label: "Organizer" },
];

export function Header() {
  const path = usePathname();
  const { wallet, setWallet } = useWallet();
  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="mr-2 text-lg font-extrabold tracking-tight">
          <span className="text-brand">◆</span> FairTix
        </Link>
        <nav className="flex gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`rounded-lg px-3 py-1.5 text-sm ${path === l.href ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="hidden text-slate-400 sm:inline">Demo wallet</span>
          <div className="flex overflow-hidden rounded-xl border border-edge">
            {(["alice", "bob"] as WalletName[]).map((w) => (
              <button
                key={w}
                onClick={() => setWallet(w)}
                className={`px-3 py-1.5 capitalize ${wallet === w ? "bg-brand text-white" : "text-slate-300 hover:bg-white/5"}`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
