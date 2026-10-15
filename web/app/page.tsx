"use client";
import { useState } from "react";
import Link from "next/link";
import config from "../../shared/config.json";
import { postJson, useChainState, useToast, useWallet, TxHash } from "@/components/Providers";
import { usd } from "@/lib/format";
import { EVENT } from "@/lib/event";

const steps = [
  { n: "1", t: "Pay by card", d: "Checkout like any online shop. No crypto wallet or app needed." },
  { n: "2", t: "Ticket is issued instantly", d: "Your ticket is minted to your account as a tamper-proof digital ticket." },
  { n: "3", t: "Resell safely", d: "Can't go? List it on the official market. Buyers are protected from fakes." },
];

export default function BuyPage() {
  const { wallet, label, signedIn, signIn } = useWallet();
  const toast = useToast();
  const { data, refresh } = useChainState(null, 5000);
  const [busy, setBusy] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);

  const face = BigInt(config.faceValue);
  const fee = BigInt(config.buyerFee);
  const total = face + fee;
  const stripe = data?.stripeEnabled ?? false;
  const sold = data ? Number(data.sold) : 0;
  const max = data?.maxSupply ?? config.maxSupply;
  const left = Math.max(max - sold, 0);
  const soldOut = !!data && left === 0;
  const pctSold = data ? Math.min((sold / max) * 100, 100) : 0;
  const low = !!data && left > 0 && left <= Math.ceil(max * 0.2);

  async function pay() {
    if (!signedIn) return signIn();
    setBusy(true);
    setLastTx(null);
    const r = await postJson("/api/checkout", { buyer: wallet });
    setBusy(false);
    if (!r.ok) return toast({ kind: "error", title: "Purchase failed", body: r.error });
    if (r.url) { window.location.href = r.url; return; }
    setLastTx(r.txHash ?? null);
    toast({ kind: "success", title: `Ticket issued to ${label}`, body: `Organizer received ${usd(config.organizerShare)} instantly.`, txHash: r.txHash });
    refresh();
  }

  const cta = busy ? "Processing…" : soldOut ? "Sold out" : !signedIn ? `Sign in to buy · ${usd(total)}` : `Get ticket · ${usd(total)}`;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="poster rounded-3xl p-6 sm:p-10">
        <div className="flex min-h-[220px] flex-col justify-end sm:min-h-[280px]">
          <span className="chip w-fit">{EVENT.category}</span>
          <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl">{config.eventName}</h1>
          <p className="mt-4 text-sm text-slate-400">{EVENT.date} · {EVENT.doors} · {EVENT.venue}</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="font-display text-xl font-bold">About this event</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              One night, one stage. Every ticket is a unique digital ticket tied to your account, so it can&apos;t be copied or faked.
              Tickets can only change hands through the official resale market, where the artist is paid on every resale.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              <Perk t="No fake tickets" d="Each ticket is verified on a public blockchain." />
              <Perk t="Artists get paid on resale" d={`${config.royaltyBps / 100}% of every resale goes to the artist.`} />
              <Perk t="Organizer paid instantly" d={`${usd(config.organizerShare)} per ticket, at the moment of sale.`} />
              <Perk t="Pay by card" d="No wallet, no crypto knowledge needed." />
            </ul>
          </section>

          <section className="card">
            <h2 className="font-display text-xl font-bold">How it works</h2>
            <ol className="mt-4 grid gap-4 sm:grid-cols-3">
              {steps.map((s) => (
                <li key={s.n} className="rounded-xl border border-edge bg-raise p-4">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-sm font-bold text-ink">{s.n}</span>
                  <div className="mt-3 font-semibold">{s.t}</div>
                  <p className="mt-1 text-sm text-slate-400">{s.d}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Booking panel */}
        <aside className="lg:sticky lg:top-24 lg:self-start" id="booking">
          <div className="card space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl font-bold">Select ticket</h2>
              <span className="label">1 per order</span>
            </div>

            <div className="rounded-xl border border-white/70 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{EVENT.tier}</div>
                  <div className="mt-0.5 text-xs text-slate-400">Standing · digital ticket</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-2xl font-bold">{usd(face)}</div>
                  <div className="text-xs text-slate-400">+ {usd(fee)} service fee</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs">
                  <span className={low ? "font-semibold text-amber-300" : "text-slate-400"}>
                    {data ? (soldOut ? "Sold out" : low ? `Only ${left} left` : `${left} available`) : "Checking availability…"}
                  </span>
                  <span className="text-slate-500">{data ? `${sold}/${max} sold` : ""}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(pctSold)} aria-valuemin={0} aria-valuemax={100} aria-label="Tickets sold">
                  <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pctSold}%` }} />
                </div>
              </div>
            </div>

            <dl className="space-y-1.5 text-sm">
              <Row k="Ticket" v={usd(face)} />
              <Row k="Service fee" v={usd(fee)} />
              <div className="my-2 border-t border-edge" />
              <Row k="Total" v={usd(total)} bold />
            </dl>

            <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-400">
              <span>Booking as</span>
              <b className="capitalize text-slate-100">{signedIn ? label : "not signed in"}</b>
            </div>

            <button className="btn hidden w-full lg:inline-flex" disabled={busy || soldOut} onClick={pay}>{cta}</button>

            <p className="text-center text-xs text-slate-500">
              Secure card checkout by Stripe
            </p>
            <div className={`rounded-lg px-3 py-2 text-xs ${stripe ? "bg-amber-500/10 text-amber-200" : "bg-white/5 text-slate-400"}`}>
              {stripe
                ? <>Test mode: pay with card <b className="font-mono">4242 4242 4242 4242</b>, any future date, any CVC. No real charge.</>
                : "Demo mode: payment is simulated and the ticket is issued immediately."}
            </div>

            <details className="group text-xs text-slate-400">
              <summary className="cursor-pointer select-none text-slate-300 hover:text-white">Where does my money go?</summary>
              <p className="mt-2 leading-relaxed">
                The {usd(fee)} service fee covers payment processing. The {usd(face)} ticket price is split on-chain the moment you pay:
                {" "}{usd(config.organizerShare)} to the organizer and {usd(config.platformShare)} to the platform.
              </p>
            </details>

            {lastTx && (
              <div className="rise rounded-xl border border-mint/40 bg-mint/10 p-3 text-sm">
                <div className="font-semibold text-mint">You&apos;re in!</div>
                <div className="mt-1 text-xs text-slate-300">Receipt <TxHash hash={lastTx} /></div>
                <Link href="/tickets" className="mt-2 inline-block text-xs font-semibold text-white underline underline-offset-2">View my tickets →</Link>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Mobile sticky bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-ink/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div>
            <div className="text-xs text-slate-400">Total</div>
            <div className="font-display text-xl font-bold leading-none">{usd(total)}</div>
          </div>
          <button className="btn ml-auto flex-1 sm:flex-none sm:px-10" disabled={busy || soldOut} onClick={pay}>{cta}</button>
        </div>
      </div>
    </div>
  );
}

function Perk({ t, d }: { t: string; d: string }) {
  return (
    <li className="rounded-xl border border-edge bg-raise p-3">
      <div>
        <div className="text-sm font-semibold">{t}</div>
        <div className="text-xs text-slate-400">{d}</div>
      </div>
    </li>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-bold" : ""}`}>
      <dt className={bold ? "" : "text-slate-400"}>{k}</dt>
      <dd className="font-mono">{v}</dd>
    </div>
  );
}
