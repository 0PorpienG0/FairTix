"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { postJson, TxHash, useToast, useWallet } from "@/components/Providers";
import { Badge, TicketCard } from "@/components/TicketCard";
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
      <section className="poster rounded-3xl p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="chip">Official resale</span>
            <h1 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">Resale market</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              Verified tickets from real fans for {data?.eventName ?? "…"}. The artist and platform are paid automatically on every sale.
              You&apos;re buying as <span className="font-semibold capitalize">{wallet}</span>.
            </p>
          </div>
          <div className="rounded-2xl border border-edge bg-raise px-5 py-3">
            <div className="label">Floor price</div>
            <div className="font-display text-3xl font-bold text-white">{s ? (s.floor ? usd(s.floor) : "—") : "…"}</div>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat k="Listed now" v={s ? String(s.activeCount) : "…"} />
        <Stat k="Resales completed" v={s ? String(s.totalResales) : "…"} />
        <Stat k="Total volume" v={s ? usd(s.totalVolume) : "…"} />
        <Stat k="Resale fees" v={data ? `${data.royaltyBps / 100}% artist · ${data.feeBps / 100}% platform` : "…"} small />
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold">Tickets for sale</h2>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            Sort by
            <select className="input !w-auto !py-1.5" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
              <option value="new">Newest</option>
            </select>
          </label>
        </div>
        {data && listings.length === 0 && (
          <div className="card flex flex-col items-center gap-2 py-10 text-center text-sm text-slate-400">
            <p className="font-semibold text-slate-200">No tickets listed yet</p>
            <p>Own a ticket? <Link href="/tickets" className="text-brand underline underline-offset-2">List it from My tickets</Link>.</p>
          </div>
        )}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data && listings.map((l) => (
            <ListingCard key={l.id} l={l} data={data} mine={!!me && l.seller.toLowerCase() === me}
              busy={busy} wallet={wallet} act={act} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-bold">Recent resales</h2>
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
      <div className={`mt-1 font-display font-bold ${small ? "text-sm leading-7" : "text-2xl"}`}>{v}</div>
    </div>
  );
}

function ListingCard({ l, data, mine, busy, wallet, act }: {
  l: Listing; data: MarketplaceResponse; mine: boolean; busy: string | null; wallet: string;
  act: (key: string, url: string, body: unknown, okTitle: string) => void;
}) {
  const price = BigInt(l.price);
  const pct = (Number(price) / Number(BigInt(data.faceValue))) * 100;
  const above = pct > 100;
  const atCap = data.capBps > 0 && price === (BigInt(data.faceValue) * BigInt(data.capBps)) / 10000n;
  const { royalty, fee, seller: receive } = splitResale(price, BigInt(data.royaltyBps), BigInt(data.feeBps));
  return (
    <TicketCard tokenId={l.tokenId} tone={mine ? "listed" : "default"}
      badge={<>
        <Badge>Seller: <span className="capitalize">{l.sellerName ?? l.seller.slice(0, 8)}</span></Badge>
        <Badge tone={above ? "amber" : "gray"}>{pct.toFixed(0)}% of face value</Badge>
        {atCap && <Badge tone="amber">At cap</Badge>}
        {mine && <Badge tone="brand">Your listing</Badge>}
      </>}
      main={<p className="text-xs leading-relaxed text-slate-400">
        {usd(royalty)} ({data.royaltyBps / 100}%) to the artist · {usd(fee)} ({data.feeBps / 100}%) to the platform · seller receives <b className="text-mint">{usd(receive)}</b>
      </p>}
      stub={mine ? (
        <button className="btn-ghost w-full" disabled={busy === `c${l.id}`}
          onClick={() => act(`c${l.id}`, "/api/resale/cancel", { wallet, listingId: l.id }, `Listing #${l.id} cancelled, ticket returned`)}>
          {busy === `c${l.id}` ? "Cancelling…" : "Cancel my listing"}
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <div>
            <div className="label">Price</div>
            <div className="font-display text-2xl font-bold leading-tight">{usd(l.price)}</div>
          </div>
          <button className="btn ml-auto" disabled={busy === `b${l.id}`}
            onClick={() => act(`b${l.id}`, "/api/resale/buy", { wallet, listingId: l.id }, `Bought ticket #${l.tokenId} for ${usd(l.price)}`)}>
            {busy === `b${l.id}` ? "Buying…" : "Buy ticket"}
          </button>
        </div>
      )} />
  );
}
