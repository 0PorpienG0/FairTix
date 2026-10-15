"use client";
import { useEffect, useRef, useState } from "react";
import { TxHash, useChainState } from "@/components/Providers";
import { short, usd } from "@/lib/format";

export default function OrganizerPage() {
  const { data, error } = useChainState(null, 2000);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!data) return;
    const ids = data.sales.map((s) => s.txHash);
    if (seen.current === null) { seen.current = new Set(ids); return; }
    const added = ids.filter((i) => !seen.current!.has(i));
    if (added.length) {
      added.forEach((a) => seen.current!.add(a));
      setFresh(new Set(added));
      const h = setTimeout(() => setFresh(new Set()), 2500);
      return () => clearTimeout(h);
    }
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Organizer dashboard</h1>
        <span className="flex items-center gap-2 text-xs text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-mint" /> live · refreshing every 2s {data && `· block ${data.block}`}
        </span>
      </div>
      {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Organizer USDC" value={data ? usd(data.balances.organizer) : "…"} big accent />
        <Stat label="Platform USDC" value={data ? usd(data.balances.platform) : "…"} />
        <Stat label="Artist royalties USDC" value={data ? usd(data.balances.artist) : "…"} />
      </div>
      <div className="text-sm text-slate-400">Tickets sold: <b className="text-slate-100">{data ? `${data.sold} / ${data.maxSupply}` : "…"}</b></div>

      <section className="card !border-mint/30">
        <h2 className="mb-3 text-lg font-bold text-mint">⚡ Instant payouts</h2>
        {data && data.sales.length === 0 && <p className="text-sm text-slate-400">Waiting for the first sale…</p>}
        <ul className="space-y-2">
          {data?.sales.map((s) => (
            <li key={s.txHash} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl bg-mint/10 px-4 py-3 ${fresh.has(s.txHash) ? "flash ring-2 ring-mint" : ""}`}>
              <div>
                <div className="text-lg font-extrabold text-mint">instant payout {usd(s.organizerAmount, { sign: true })}</div>
                <div className="text-xs text-slate-400">
                  Ticket #{s.tokenId} → <span className="capitalize">{s.buyerName ?? short(s.buyer)}</span> · platform {usd(s.platformAmount, { sign: true })} · block {s.block}
                </div>
              </div>
              <div className="text-xs text-slate-400">tx <TxHash hash={s.txHash} /></div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-bold">Secondary sales (capped resale)</h2>
        {data && data.resales.length === 0 && <p className="text-sm text-slate-400">No resales yet.</p>}
        <ul className="divide-y divide-edge text-sm">
          {data?.resales.map((r) => (
            <li key={r.txHash} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>Ticket #{r.tokenId} sold for <b>{usd(r.price)}</b></span>
              <span className="text-xs text-slate-400">
                artist {usd(r.royalty, { sign: true })} · platform {usd(r.fee, { sign: true })} · seller {usd(r.sellerProceeds, { sign: true })} · <TxHash hash={r.txHash} />
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, big, accent }: { label: string; value: string; big?: boolean; accent?: boolean }) {
  return (
    <div className={`card ${accent ? "!border-mint/40" : ""}`}>
      <div className="label">{label}</div>
      <div className={`mt-1 font-mono font-bold ${big ? "text-3xl text-mint" : "text-2xl"}`}>{value}</div>
    </div>
  );
}
