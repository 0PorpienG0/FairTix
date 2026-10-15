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

  const pctSold = data ? Math.min((Number(data.sold) / data.maxSupply) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="label">Organizer view</span>
          <h1 className="font-display text-3xl font-bold">Sales dashboard</h1>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-edge px-3 py-1 text-xs text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-mint" /> Live{data && ` · block ${data.block}`}
        </span>
      </div>
      {error && <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="poster rounded-2xl p-6 lg:col-span-2">
          <div>
            <div className="label">Organizer received (test USDC)</div>
            <div className="mt-1 font-display text-5xl font-bold text-white">{data ? usd(data.balances.organizer) : "…"}</div>
            <div className="mt-5 flex justify-between text-xs text-slate-400">
              <span>Tickets sold</span>
              <span>{data ? `${data.sold} / ${data.maxSupply}` : "…"}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(pctSold)} aria-valuemin={0} aria-valuemax={100} aria-label="Tickets sold">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pctSold}%` }} />
            </div>
          </div>
        </div>
        <div className="grid gap-4">
          <Stat label="Platform earned" value={data ? usd(data.balances.platform) : "…"} />
          <Stat label="Artist royalties" value={data ? usd(data.balances.artist) : "…"} />
        </div>
      </div>

      <section className="card !border-mint/30">
        <h2 className="mb-3 font-display text-lg font-bold text-mint">⚡ Instant payouts</h2>
        {data && data.sales.length === 0 && <p className="text-sm text-slate-400">Waiting for the first sale…</p>}
        <ul className="space-y-2">
          {data?.sales.map((s) => (
            <li key={s.txHash} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl bg-mint/10 px-4 py-3 ${fresh.has(s.txHash) ? "flash ring-2 ring-mint" : ""}`}>
              <div>
                <div className="font-display text-lg font-bold text-mint">{usd(s.organizerAmount, { sign: true })} paid out instantly</div>
                <div className="text-xs text-slate-400">
                  Ticket #{s.tokenId} to <span className="capitalize">{s.buyerName ?? short(s.buyer)}</span> · platform {usd(s.platformAmount, { sign: true })} · block {s.block}
                </div>
              </div>
              <div className="text-xs text-slate-400">tx <TxHash hash={s.txHash} /></div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="mb-3 font-display text-lg font-bold">Resale earnings (royalty + platform fee)</h2>
        {data && data.resales.length === 0 && <p className="text-sm text-slate-400">No resales yet.</p>}
        <ul className="divide-y divide-edge text-sm">
          {data?.resales.map((r) => (
            <li key={r.txHash} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>Ticket #{r.tokenId} resold for <b>{usd(r.price)}</b></span>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold">{value}</div>
    </div>
  );
}
