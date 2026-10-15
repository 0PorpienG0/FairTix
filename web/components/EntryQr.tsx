"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { EVENT } from "@/lib/event";
import config from "../../shared/config.json";

const WINDOW_MS = 30_000;

/** Entry QR for one ticket. The server signs a fresh code every 30 seconds, so a screenshot stops working. */
export function EntryQr({ tokenId, wallet, onClose }: { tokenId: string; wallet: string; onClose: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  const [exp, setExp] = useState(0);
  const [used, setUsed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const r = await fetch(`/api/ticket/qr?tokenId=${tokenId}&wallet=${wallet}`, { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (!j.ok) return setErr(j.error ?? "Could not load the QR");
        if (j.used) return setUsed(true);
        const url = await QRCode.toDataURL(j.code, { margin: 1, width: 480, errorCorrectionLevel: "M" });
        if (!alive) return;
        setImg(url);
        setExp(j.expiresAt);
        setErr(null);
        timer = setTimeout(load, Math.max(j.expiresAt - Date.now() - 1500, 1500)); // refresh just before it expires
      } catch (e) {
        if (alive) {
          setErr((e as Error).message);
          timer = setTimeout(load, 4000);
        }
      }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [tokenId, wallet]);

  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 250);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => { clearInterval(h); window.removeEventListener("keydown", esc); };
  }, [onClose]);

  const left = Math.max(0, Math.min(1, (exp - now) / WINDOW_MS));

  // Portal to <body>: the ticket card animates with a transform, which would otherwise trap a fixed overlay inside it.
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label={`Entry QR for ticket ${tokenId}`} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-edge bg-panel p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="label">Entry pass · Ticket #{tokenId}</div>
            <div className="mt-1 font-display text-lg font-bold leading-tight">{config.eventName}</div>
            <div className="text-xs text-slate-400">{EVENT.date} · {EVENT.doors}</div>
          </div>
          <button className="text-slate-500 hover:text-slate-200" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="mt-4 grid aspect-square place-items-center rounded-xl bg-white p-3">
          {used ? (
            <div className="text-center text-ink">
              <div className="text-2xl font-bold">Already used</div>
              <div className="mt-1 text-sm text-slate-600">This ticket has been scanned at the gate.</div>
            </div>
          ) : img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="Entry QR code" className="h-full w-full" />
          ) : (
            <div className="text-sm text-slate-500">{err ?? "Preparing your pass…"}</div>
          )}
        </div>

        {!used && (
          <>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Time until the code changes" aria-valuenow={Math.round(left * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-brand" style={{ width: `${left * 100}%` }} />
            </div>
            <p className="mt-2 text-center text-xs text-slate-400">
              This code changes every 30 seconds, so a screenshot won&apos;t work. Show it at the gate.
            </p>
            {err && img && <p className="mt-1 text-center text-xs text-amber-300">{err}</p>}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
