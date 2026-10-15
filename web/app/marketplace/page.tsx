"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { postJson, TxHash, useToast, useWallet } from "@/components/Providers";
import { splitResale, usd } from "@/lib/format";
import type { Listing, MarketplaceResponse } from "@/lib/types";

type Sort = "low" | "high" | "new";

export default function MarketplacePage() {
  const { wallet } = useWallet();
  const toast = useToast();
  const [data, setData] = useState<MarketplaceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("low");
  const [me, setMe] = useState<string | null>(null);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/marketplace", { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (j.ok === false) setError(j.error ?? "Marketplace error");
        else { setData(j as MarketplaceResponse); setError(null); }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    load();
    const h = setInterval(load, 2000);
    return () => { alive = false; clearInterval(h); };
  }, [tick]);

  useEffect(() => {
    let alive = true;
    setMe(null);
    fetch(`/api/state?wallet=${wallet}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (alive) setMe(j?.wallet?.address?.toLowerCase() ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [wallet]);

  async function act(key: string, url: string, body: unknown, okTitle: string) {
    setBusy(key);
    const r = await postJson(url, body);
    setBusy(null);
    if (r.ok) toast({ kind: "success", title: okTitle, txHash: r.txHash });
    else toast({ kind: "error", title: "Transaction failed", body: r.error });
    refresh();
  }

  const listings = useMemo(() => {
    const l = [...(data?.listings ?? [])];
    const byPrice = (a: Listing, b: Listing) => (BigInt(a.price) < BigInt(b.price) ? -1 : BigInt(a.price) > BigInt(b.price) ? 1 : 0);
    if (sort === "low") l.sort((a, b) => byPrice(a, b) || Number(a.id) - Number(b.id));
    else if (sort === "high") l.sort((a, b) => byPrice(b, a) || Number(a.id) - Number(b.id));
    else l.sort((a, b) => Number(b.id) - Number(a.id));
    return l;
  }, [data, sort]);

  const s = data?.stats;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">Marketplace</h1>
          <p className="text-sm text-slate-400">Resale tickets for {data?.eventName ?? "…"} · open pricing, artist and platform paid automatically · acting as <span className="capitalize text-slate-200">{wallet}</span></p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          Sort
          <select className="input !w-auto !py-1.5" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="low">Price: low to high</option>
            <option value="high">Price: high to low</option>
            <option value="new">Newest</option>
          </select>
        </label>
      </div>
      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat k="Active listings" v={s ? String(s.activeCount) : "…"} />
        <Stat k="Fees" v={data ? `${data.royaltyBps / 100}% artist + ${data.feeBps / 100}% platform` : "…"} small />
        <Stat k="Floor price" v={s ? (s.floor ? usd(s.floor) : "—") : "…"} />
        <Stat k="Resales completed" v={s ? String(s.totalResales) : "…"} />
        <Stat k="Total volume" v={s ? usd(s.totalVolume) : "…"} />
      </div>

      <section>
        {data && listings.length === 0 && (
          <div className="card text-center text-sm text-slate-400">
            <p className="font-semibold text-slate-200">No tickets listed yet</p>
            <p className="mt-1">Own a ticket? <Link href="/tickets" className="text-brand underline underline-offset-2">List it from My tickets</Link>.</p>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data && listings.map((l) => (
            <TicketCard key={l.id} l={l} data={data} mine={!!me && l.seller.toLowerCase() === me}
              busy={busy} wallet={wallet} act={act} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Recent resales</h2>
        {data && data.resales.length === 0 && <div className="card text-sm text-slate-400">No resales completed yet.</div>}
        <div className="space-y-2">
          {data?.resales.slice(0, 20).map((r) => (
            <div key={r.txHash} className="card flex flex-wrap items-center justify-between gap-x-4 gap-y-1 !py-3 text-sm">
              <div>
                <span className="font-semibold capitalize">{r.buyerName ?? r.buyer.slice(0, 8)}</span> bought <b>Ticket #{r.tokenId}</b> for <span className="font-mono">{usd(r.price)}</span>
              </div>
              <div className="font-mono text-xs text-slate-400">
                artist {usd(r.royalty)} · platform {usd(r.fee)} · seller {usd(r.sellerProceeds)}
              </div>
              <div className="text-xs text-slate-400">tx <TxHash hash={r.txHash} /></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ k, v, small }: { k: string; v: string; small?: boolean }) {
  return (
    <div className="card !py-3">
      <div className="label">{k}</div>
      <div className={`mt-1 font-mono font-bold ${small ? "text-sm leading-7" : "text-xl"}`}>{v}</div>
    </div>
  );
}

function TicketCard({ l, data, mine, busy, wallet, act }: {
  l: Listing; data: MarketplaceResponse; mine: boolean; busy: string | null; wallet: string;
  act: (key: string, url: string, body: unknown, okTitle: string) => void;
}) {
  const price = BigInt(l.price);
  const pct = (Number(price) / Number(BigInt(data.faceValue))) * 100;
  const above = pct > 100;
  const atCap = data.capBps > 0 && price === (BigInt(data.faceValue) * BigInt(data.capBps)) / 10000n;
  const { royalty, fee, seller: receive } = splitResale(price, BigInt(data.royaltyBps), BigInt(data.feeBps));
  return (
    <div className={`card ${mine ? "border-brand/40" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-slate-400">{data.eventName}</div>
          <div className="text-lg font-bold">Ticket #{l.tokenId}</div>
        </div>
        <div className="text-right font-mono text-xl">{usd(l.price)}</div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-400">Seller <span className="capitalize text-slate-200">{l.sellerName ?? l.seller.slice(0, 8)}</span></span>
        <span className={`rounded-full px-2 py-0.5 ${above ? "bg-amber-500/15 text-amber-200" : "bg-white/10 text-slate-300"}`}>{pct.toFixed(0)}% of face value{above ? " · above face value" : ""}</span>
        {atCap && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-300">at cap</span>}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {usd(royalty)} ({data.royaltyBps / 100}%) → artist · {usd(fee)} ({data.feeBps / 100}%) → platform · seller receives <b className="text-mint">{usd(receive)}</b>
      </p>
      {mine ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="rounded-full bg-brand/20 px-3 py-1.5 text-xs text-brand">Your listing</span>
          <button className="btn-ghost ml-auto" disabled={busy === `c${l.id}`}
            onClick={() => act(`c${l.id}`, "/api/resale/cancel", { wallet, listingId: l.id }, `Listing #${l.id} cancelled, ticket returned`)}>
            {busy === `c${l.id}` ? "Cancelling…" : "Cancel"}
          </button>
        </div>
      ) : (
        <button className="btn mt-3 w-full" disabled={busy === `b${l.id}`}
          onClick={() => act(`b${l.id}`, "/api/resale/buy", { wallet, listingId: l.id }, `Bought ticket #${l.tokenId} for ${usd(l.price)}`)}>
          {busy === `b${l.id}` ? "Buying…" : `Buy as ${wallet} · ${usd(l.price)}`}
        </button>
      )}
    </div>
  );
}
