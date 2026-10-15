"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useWallet } from "./Providers";
import { EVENT } from "@/lib/event";
import type { WalletName } from "@/lib/types";

const links = [
  { href: "/", label: "Event" },
  { href: "/marketplace", label: "Resale market" },
  { href: "/tickets", label: "My tickets" },
  { href: "/organizer", label: "Organizer" },
];

export function Header() {
  const path = usePathname();
  const { wallet, setWallet, clerk, signedIn, signIn } = useWallet();
  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-ink/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-sm text-white">◆</span>
          FairTix
        </Link>
        <nav className="ml-2 hidden gap-1 md:flex" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${path === l.href ? "bg-brand/20 text-white" : "text-slate-400 hover:text-white"}`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden items-center gap-1.5 rounded-full border border-edge px-3 py-1 text-xs text-slate-300 lg:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" /> {EVENT.network}
          </span>
          {clerk ? (
            signedIn ? <UserButton /> : <button className="btn !px-4 !py-2" onClick={signIn}>Sign in</button>
          ) : (
          <div className="flex items-center gap-1 rounded-full border border-edge bg-panel p-1" role="group" aria-label="Viewing as">
            {(["alice", "bob"] as WalletName[]).map((w) => (
              <button key={w} onClick={() => setWallet(w)} aria-pressed={wallet === w}
                className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 capitalize transition ${wallet === w ? "bg-brand/20 text-white" : "text-slate-400 hover:text-white"}`}>
                <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${wallet === w ? "bg-brand text-white" : "bg-white/10 text-slate-300"}`}>
                  {w[0].toUpperCase()}
                </span>
                {w}
              </button>
            ))}
          </div>
          )}
        </div>
      </div>
      <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 md:hidden" aria-label="Main mobile">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ${path === l.href ? "bg-brand/20 text-white" : "text-slate-400"}`}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
