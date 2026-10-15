"use client";
import { useState } from "react";
import { postJson, useChainState, useToast, useWallet } from "@/components/Providers";
import { CAP_BPS, FEE_BPS, ROYALTY_BPS, parseUsd, splitResale, usd } from "@/lib/format";
import config from "../../../shared/config.json";
import type { Listing } from "@/lib/types";

const cap = (BigInt(config.faceValue) * BigInt(CAP_BPS)) / 10000n; // 0n = no cap
const pctRoy = Number(ROYALTY_BPS) / 100;
const pctFee = Number(FEE_BPS) / 100;
const pctSeller = 100 - pctRoy - pctFee;

export default function TicketsPage() {
  const { wallet } = useWallet();
  const toast = useToast();
  const { data, error, refresh } = useChainState(wallet, 3000);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, url: string, body: unknown, okTitle: string) {
    setBusy(key);
    const r = await postJson(url, body);
    setBusy(null);
    if (r.ok) toast({ kind: "success", title: okTitle, txHash: r.txHash });
    else toast({ kind: "error", title: r.errorName === "PriceAboveCap" && CAP_BPS > 0 ? "Listing rejected (PriceAboveCap)" : "Transaction failed", body: r.error });
    refresh();
    return r;
  }

  const buyable = (data?.listings ?? []) as Listing[];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold capitalize">{wallet}&apos;s tickets</h1>
          <p className="font-mono text-xs text-slate-500">{data?.wallet?.address}</p>
        </div>
        <div className="card !py-2 text-sm">USDC balance <b className="ml-2 font-mono text-mint">{data?.wallet ? usd(data.wallet.usdc) : "…"}</b></div>
      </div>
      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

      <section>
        <h2 className="mb-3 text-lg font-bold">Owned tickets</h2>
        {data && data.tickets.length === 0 && data.myListings.length === 0 && (
          <div className="card text-sm text-slate-400">No tickets yet. Buy one on the home page.</div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {data?.tickets.map((t) => (
            <ListForm key={t.tokenId} tokenId={t.tokenId} busy={busy === `list${t.tokenId}`}
              onSubmit={(price) => act(`list${t.tokenId}`, "/api/resale/list", { wallet, tokenId: t.tokenId, price: price.toString() }, `Ticket #${t.tokenId} listed for ${usd(price)}`)} />
          ))}
          {data?.myListings.map((l) => (
            <div key={l.id} className="card border-brand/40">
              <div className="flex items-center justify-between">
                <div className="font-bold">Ticket #{l.tokenId}</div>
                <span className="rounded-full bg-brand/20 px-2 py-0.5 text-xs text-brand">Listed · {usd(l.price)}</span>
              </div>
              <p className="mt-2 text-xs text-slate-400">Escrowed in the marketplace. You receive {usd(splitResale(BigInt(l.price)).seller)} when sold ({pctSeller}% of the price).</p>
              <button className="btn-ghost mt-3" disabled={busy === `c${l.id}`} onClick={() => act(`c${l.id}`, "/api/resale/cancel", { wallet, listingId: l.id }, `Listing #${l.id} cancelled, ticket returned`)}>
                {busy === `c${l.id}` ? "Cancelling…" : "Cancel listing"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Marketplace · other users&apos; listings</h2>
        {buyable.length === 0 && <div className="card text-sm text-slate-400">No listings from other users right now.</div>}
        <div className="grid gap-4 md:grid-cols-2">
          {buyable.map((l) => (
            <div key={l.id} className="card">
              <div className="flex items-center justify-between">
                <div className="font-bold">Ticket #{l.tokenId}</div>
                <div className="font-mono text-lg">{usd(l.price)}</div>
              </div>
              <p className="mt-1 text-xs text-slate-400">Seller: <span className="capitalize">{l.sellerName ?? l.seller}</span> · includes {usd(splitResale(BigInt(l.price)).royalty)} artist royalty ({pctRoy}%) + {usd(splitResale(BigInt(l.price)).fee)} platform fee ({pctFee}%)</p>
              <button className="btn mt-3 w-full" disabled={busy === `b${l.id}`} onClick={() => act(`b${l.id}`, "/api/resale/buy", { wallet, listingId: l.id }, `Bought ticket #${l.tokenId} for ${usd(l.price)}`)}>
                {busy === `b${l.id}` ? "Buying…" : `Buy as ${wallet} · ${usd(l.price)}`}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ListForm({ tokenId, busy, onSubmit }: { tokenId: string; busy: boolean; onSubmit: (price: bigint) => void }) {
  const [txt, setTxt] = useState("60");
  const price = parseUsd(txt);
  const valid = price !== null && price > 0n;
  const over = valid && cap > 0n && price > cap;
  const sp = valid ? splitResale(price) : null;

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="font-bold">Ticket #{tokenId}</div>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">Owned</span>
      </div>
      <h3 className="label mt-4">List for resale</h3>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-slate-400">$</span>
        <input className="input font-mono" inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)} />
      </div>

      <dl className="mt-3 space-y-1 rounded-lg bg-white/5 p-3 text-xs">
        <Line k="Sale price" v={price !== null ? usd(price) : "—"} />
        <Line k={`Artist royalty (${pctRoy}%)`} v={sp ? `-${usd(sp.royalty)}` : "—"} />
        <Line k={`Platform fee (${pctFee}%)`} v={sp ? `-${usd(sp.fee)}` : "—"} />
        <div className="border-t border-edge pt-1" />
        <Line k={`You receive (${pctSeller}%)`} v={sp ? usd(sp.seller) : "—"} strong />
      </dl>
      {over && <p className="mt-2 text-xs text-amber-300">Above the resale cap of {usd(cap)}; the contract will reject this listing.</p>}
      <button className="btn mt-3 w-full" disabled={busy || !valid} onClick={() => valid && onSubmit(price)}>
        {busy ? "Submitting…" : "List for resale"}
      </button>
    </div>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-sm font-bold text-mint" : ""}`}>
      <dt className={strong ? "" : "text-slate-400"}>{k}</dt>
      <dd className="font-mono">{v}</dd>
    </div>
  );
}
