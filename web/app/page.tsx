"use client";
import { useState } from "react";
import Link from "next/link";
import config from "../../shared/config.json";
import { postJson, useChainState, useToast, useWallet, TxHash } from "@/components/Providers";
import { usd } from "@/lib/format";

export default function BuyPage() {
  const { wallet } = useWallet();
  const toast = useToast();
  const { data, refresh } = useChainState(null, 5000);
  const [busy, setBusy] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);

  const face = BigInt(config.faceValue);
  const fee = BigInt(config.buyerFee);
  const total = face + fee;
  const stripe = data?.stripeEnabled ?? false;

  async function pay() {
    setBusy(true);
    setLastTx(null);
    const r = await postJson("/api/checkout", { buyer: wallet });
    setBusy(false);
    if (!r.ok) return toast({ kind: "error", title: "Purchase failed", body: r.error });
    if (r.url) { window.location.href = r.url; return; }
    setLastTx(r.txHash ?? null);
    toast({ kind: "success", title: `Ticket minted to ${wallet}`, body: `Organizer received ${usd(config.organizerShare)} instantly.`, txHash: r.txHash });
    refresh();
  }

  const soldOut = data ? Number(data.sold) >= data.maxSupply : false;

  return (
    <div className="grid gap-6 md:grid-cols-5">
      <section className="card md:col-span-3">
        <div className="mb-4 h-44 rounded-xl bg-gradient-to-br from-brand via-fuchsia-500 to-orange-400 p-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-white/80">Live tonight</div>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight">{config.eventName}</h1>
          <p className="mt-1 text-sm text-white/80">General admission · NFT ticket, transfers only via the official marketplace</p>
        </div>
        <ul className="space-y-2 text-sm text-slate-300">
          <li>✓ Pay by card — no crypto wallet needed</li>
          <li>✓ Resale pays the artist {config.royaltyBps / 100}% and the platform {config.resaleFeeBps / 100}% automatically</li>
          <li>✓ Organizer is paid instantly on-chain: {usd(config.organizerShare)} per ticket</li>
        </ul>
        <div className="mt-5 text-sm text-slate-400">
          {data ? `${data.sold} / ${data.maxSupply} sold` : "…"}
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-mint transition-all" style={{ width: `${data ? (Number(data.sold) / data.maxSupply) * 100 : 0}%` }} />
        </div>
      </section>

      <section className="card md:col-span-2 self-start">
        <h2 className="text-lg font-bold">Checkout</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <Row k="Ticket (face value)" v={usd(face)} />
          <Row k="Service fee" v={usd(fee)} />
          <div className="my-2 border-t border-edge" />
          <Row k="Total charged to card" v={usd(total)} bold />
        </dl>
        <p className="mt-3 rounded-lg bg-white/5 p-3 text-xs text-slate-400">
          Stripe keeps the {usd(fee)} fee. The remaining <b className="text-slate-200">{usd(face)}</b> is converted to USDC and
          split on-chain: {usd(config.organizerShare)} organizer / {usd(config.platformShare)} platform.
        </p>
        <p className="mt-2 text-xs text-slate-400">Organizer receives {usd(config.organizerShare)} instantly · platform fee {usd(config.platformShare)}</p>

        <div className="mt-4 text-xs text-slate-400">Buying as <b className="capitalize text-slate-100">{wallet}</b> (switch in header)</div>
        <button className="btn mt-2 w-full" disabled={busy || soldOut} onClick={pay}>
          {busy ? "Processing…" : soldOut ? "Sold out" : `Pay with card · ${usd(total)}`}
        </button>
        <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${stripe ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
          {stripe ? "Stripe Checkout (test mode) — you will be redirected." : "Demo mode (no Stripe keys) — payment is simulated; ticket is minted immediately."}
        </div>

        {lastTx && (
          <div className="mt-4 rounded-xl border border-mint/40 bg-mint/10 p-3 text-sm">
            <div className="font-semibold text-mint">Ticket purchased!</div>
            <div className="mt-1 text-xs text-slate-300">tx <TxHash hash={lastTx} /></div>
            <Link href={`/tickets?wallet=${wallet}`} className="mt-2 inline-block text-xs text-brand underline">View my tickets →</Link>
          </div>
        )}
      </section>
    </div>
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
