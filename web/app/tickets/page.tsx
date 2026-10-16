"use client";
import { useState } from "react";
import Link from "next/link";
import { postJson, useChainState, useToast, useWallet } from "@/components/Providers";
import { Badge, TicketCard } from "@/components/TicketCard";
import { EntryQr } from "@/components/EntryQr";
import { CAP_BPS, FEE_BPS, ROYALTY_BPS, parseUsd, splitResale, usd } from "@/lib/format";
import config from "../../../shared/config.json";
import type { Listing } from "@/lib/types";

const cap = (BigInt(config.faceValue) * BigInt(CAP_BPS)) / 10000n; // 0n = no cap
const pctRoy = Number(ROYALTY_BPS) / 100;
const pctFee = Number(FEE_BPS) / 100;
const pctTotal = pctRoy + pctFee; // shown to users as one transaction fee
const pctSeller = 100 - pctTotal;

export default function TicketsPage() {
  const { wallet, label, signedIn, signIn } = useWallet();
  const toast = useToast();
  const { data, error, refresh } = useChainState(signedIn ? wallet : null, 3000);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(key: string, url: string, body: unknown, okTitle: string) {
    if (!signedIn) { signIn(); return; }
    setBusy(key);
    const r = await postJson(url, body);
    if (r.ok && r.url) { window.location.href = r.url; return; } // no USDC: pay this ticket by card
    setBusy(null);
    if (r.ok) toast({ kind: "success", title: okTitle, txHash: r.txHash });
    else toast({ kind: "error", title: r.errorName === "PriceAboveCap" && CAP_BPS > 0 ? "Listing rejected (PriceAboveCap)" : "Transaction failed", body: r.error });
    refresh();
    return r;
  }

  const buyable = (data?.listings ?? []) as Listing[];
  const owned = data?.tickets.length ?? 0;
  const listed = data?.myListings.length ?? 0;

  if (!signedIn) {
    return (
      <div className="card mx-auto flex max-w-md flex-col items-center gap-3 py-12 text-center">
        <div className="font-display text-xl font-bold">Sign in to see your tickets</div>
        <p className="text-sm text-slate-400">Sign in with Google. Your tickets and wallet are created for you, no crypto knowledge needed.</p>
        <button className="btn mt-1" onClick={signIn}>Sign in</button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-full border border-edge bg-raise font-display text-2xl font-bold text-white">
            {(label[0] ?? "?").toUpperCase()}
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold capitalize sm:text-3xl">{label}&apos;s tickets</h1>
            <p className="font-mono text-xs text-slate-500">{data?.wallet?.address ?? "…"}</p>
          </div>
        </div>
        <div className="card flex items-center gap-4 !py-3">
          <div>
            <div className="label" title="Money from selling tickets lands here. Use it to buy other tickets, or pay by card.">Test USDC balance</div>
            <div className="font-display text-xl font-bold text-mint">{data?.wallet ? usd(data.wallet.usdc) : "…"}</div>
          </div>
          <div className="h-8 w-px bg-edge" />
          <div>
            <div className="label">Tickets</div>
            <div className="font-display text-xl font-bold">{data ? owned + listed : "…"}</div>
          </div>
        </div>
      </div>
      {error && <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

      <section>
        <h2 className="mb-3 font-display text-xl font-bold">Your tickets</h2>
        {data && owned === 0 && listed === 0 && (
          <div className="card flex flex-col items-center gap-3 py-10 text-center">
            <div className="font-semibold">No tickets yet</div>
            <p className="max-w-sm text-sm text-slate-400">Grab a ticket for {config.eventName} and it will show up here.</p>
            <Link href="/#booking" className="btn mt-1">Get tickets</Link>
          </div>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          {data?.tickets.map((t) => (
            <OwnedTicket key={t.tokenId} tokenId={t.tokenId} used={t.used} wallet={wallet} busy={busy === `list${t.tokenId}`}
              onSubmit={(price) => act(`list${t.tokenId}`, "/api/resale/list", { wallet, tokenId: t.tokenId, price: price.toString() }, `Ticket #${t.tokenId} listed for ${usd(price)}`)} />
          ))}
          {data?.myListings.map((l) => (
            <TicketCard key={l.id} tokenId={l.tokenId} tone="listed"
              badge={<><Badge tone="brand">Listed for resale</Badge><span className="font-display text-lg font-bold">{usd(l.price)}</span></>}
              main={<p className="text-xs text-slate-400">Held safely in escrow. You receive <b className="text-mint">{usd(splitResale(BigInt(l.price)).seller)}</b> ({pctSeller}%) when it sells.</p>}
              stub={
                <button className="btn-ghost w-full" disabled={busy === `c${l.id}`}
                  onClick={() => act(`c${l.id}`, "/api/resale/cancel", { wallet, listingId: l.id }, `Listing #${l.id} cancelled, ticket returned`)}>
                  {busy === `c${l.id}` ? "Cancelling…" : "Cancel listing"}
                </button>
              } />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold">Available from other fans</h2>
          <Link href="/marketplace" className="text-sm font-medium text-brand hover:underline">See full market →</Link>
        </div>
        {buyable.length === 0 && <div className="card text-sm text-slate-400">No listings from other users right now.</div>}
        <div className="grid gap-5 md:grid-cols-2">
          {buyable.map((l) => {
            const sp = splitResale(BigInt(l.price));
            return (
              <TicketCard key={l.id} tokenId={l.tokenId}
                badge={<><Badge>Seller: <span className="capitalize">{l.sellerName ?? l.seller.slice(0, 8)}</span></Badge></>}
                main={<p className="text-xs text-slate-400">Includes a {pctTotal}% transaction fee ({usd(sp.royalty + sp.fee)}).</p>}
                stub={
                  <div className="flex items-center gap-3">
                    <div className="font-display text-2xl font-bold">{usd(l.price)}</div>
                    <button className="btn ml-auto" disabled={busy === `b${l.id}`}
                      onClick={() => act(`b${l.id}`, "/api/resale/buy", { wallet, listingId: l.id }, `Bought ticket #${l.tokenId} for ${usd(l.price)}`)}>
                      {busy === `b${l.id}` ? "Buying…" : "Buy"}
                    </button>
                  </div>
                } />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function OwnedTicket({ tokenId, used, wallet, busy, onSubmit }: { tokenId: string; used: boolean; wallet: string; busy: boolean; onSubmit: (price: bigint) => void }) {
  const [open, setOpen] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [txt, setTxt] = useState("60");
  const price = parseUsd(txt);
  const valid = price !== null && price > 0n;
  const over = valid && cap > 0n && price > cap;
  const sp = valid ? splitResale(price) : null;

  return (
    <TicketCard tokenId={tokenId}
      badge={used ? <Badge tone="amber">Checked in</Badge> : <Badge tone="mint">Valid · ready to use</Badge>}
      main={
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs text-slate-400">{config.eventName}</div>
          <div className="font-mono text-xs uppercase tracking-widest text-slate-500">Admit one</div>
        </div>
      }
      stub={
        <div>
          {showQr && <EntryQr tokenId={tokenId} wallet={wallet} onClose={() => setShowQr(false)} />}
          {!open ? (
            <div className="space-y-2">
              <button className="btn w-full" onClick={() => setShowQr(true)}>{used ? "View entry pass" : "Show entry QR"}</button>
              {!used && <button className="btn-ghost w-full" onClick={() => setOpen(true)}>Can&apos;t go? Resell this ticket</button>}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="label" htmlFor={`price${tokenId}`}>Resale price</label>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">$</span>
                <input id={`price${tokenId}`} className="input font-mono" inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)} />
              </div>
              <dl className="space-y-1 rounded-lg bg-white/5 p-3 text-xs">
                <Line k="Sale price" v={price !== null ? usd(price) : "—"} />
                <Line k={`Transaction fee (${pctTotal}%)`} v={sp ? `-${usd(sp.royalty + sp.fee)}` : "—"} />
                <div className="border-t border-edge pt-1" />
                <Line k={`You receive (${pctSeller}%)`} v={sp ? usd(sp.seller) : "—"} strong />
              </dl>
              {over && <p className="text-xs text-amber-300">Above the resale cap of {usd(cap)}; the contract will reject this listing.</p>}
              <div className="flex gap-2">
                <button className="btn-ghost" onClick={() => setOpen(false)}>Back</button>
                <button className="btn flex-1" disabled={busy || !valid} onClick={() => valid && onSubmit(price)}>{busy ? "Submitting…" : "List for resale"}</button>
              </div>
            </div>
          )}
        </div>
      } />
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
