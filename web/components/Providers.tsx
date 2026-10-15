"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { txUrl, short } from "@/lib/format";
import type { ApiResult, StateResponse, WalletName } from "@/lib/types";

/* ---------- toasts ---------- */
export interface ToastInput { kind: "success" | "error" | "info"; title: string; body?: string; txHash?: string }
interface Toast extends ToastInput { id: number }
const ToastCtx = createContext<(t: ToastInput) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

/* ---------- wallet ---------- */
/**
 * `wallet` is what API calls send: "alice"/"bob" in demo mode, "me" when Clerk is on (the server reads the session instead).
 * `label` is the name shown in the UI; `signIn()` opens the Clerk modal.
 */
interface WalletCtx { wallet: string; setWallet: (w: WalletName) => void; label: string; signedIn: boolean; clerk: boolean; signIn: () => void }
const WalletContext = createContext<WalletCtx>({ wallet: "alice", setWallet: () => {}, label: "alice", signedIn: true, clerk: false, signIn: () => {} });
export const useWallet = () => useContext(WalletContext);

export const clerkOn = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
function useClerkIdentity() {
  const { isSignedIn, user } = useUser();
  const { openSignIn } = useClerk();
  const label = user?.firstName || user?.primaryEmailAddress?.emailAddress.split("@")[0] || "you";
  return { signedIn: !!isSignedIn, label, signIn: () => openSignIn() };
}
const useNoClerk = () => ({ signedIn: true, label: "", signIn: () => {} });
// clerkOn is fixed at build time, so the same hook runs on every render.
const useIdentity = clerkOn ? useClerkIdentity : useNoClerk;

export function TxHash({ hash }: { hash: string }) {
  const url = txUrl(hash);
  const label = short(hash);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="font-mono text-mint underline underline-offset-2">{label} ↗</a>
  ) : (
    <span className="font-mono text-mint" title={hash}>{label}</span>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [wallet, setWalletState] = useState<WalletName>("alice");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const ident = useIdentity();

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("wallet");
      const saved = q || localStorage.getItem("wallet");
      if (saved === "alice" || saved === "bob") setWalletState(saved);
    } catch {}
  }, []);
  const setWallet = useCallback((w: WalletName) => {
    setWalletState(w);
    try { localStorage.setItem("wallet", w); } catch {}
  }, []);

  const push = useCallback((t: ToastInput) => {
    const id = nextId.current++;
    setToasts((s) => [...s.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), t.kind === "error" ? 9000 : 7000);
  }, []);

  const color = { success: "border-mint/50", error: "border-red-500/60", info: "border-brand/60" } as const;
  const icon = { success: "✓", error: "✕", info: "i" } as const;

  return (
    <WalletContext.Provider value={{ wallet: clerkOn ? "me" : wallet, setWallet, label: clerkOn ? ident.label : wallet, signedIn: ident.signedIn, clerk: clerkOn, signIn: ident.signIn }}>
      <ToastCtx.Provider value={push}>
        {children}
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,380px)] flex-col gap-2">
          {toasts.map((t) => (
            <div key={t.id} className={`pointer-events-auto rounded-xl border ${color[t.kind]} bg-panel p-3 shadow-xl`}>
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${t.kind === "error" ? "bg-red-500/20 text-red-300" : "bg-mint/20 text-mint"}`}>{icon[t.kind]}</span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-semibold">{t.title}</div>
                  {t.body && <div className="mt-0.5 text-slate-300">{t.body}</div>}
                  {t.txHash && <div className="mt-1 text-xs text-slate-400">tx <TxHash hash={t.txHash} /></div>}
                </div>
                <button className="text-slate-500 hover:text-slate-200" onClick={() => setToasts((s) => s.filter((x) => x.id !== t.id))}>×</button>
              </div>
            </div>
          ))}
        </div>
      </ToastCtx.Provider>
    </WalletContext.Provider>
  );
}

/* ---------- helpers ---------- */
export async function postJson(url: string, body: unknown): Promise<ApiResult> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return (await r.json()) as ApiResult;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Poll /api/state. intervalMs=0 disables polling. */
export function useChainState(wallet: string | null, intervalMs: number) {
  const [data, setData] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/state${wallet ? `?wallet=${wallet}` : ""}`, { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (j.ok === false) setError(j.error ?? "State error");
        else { setData(j as StateResponse); setError(null); }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    load();
    if (!intervalMs) return () => { alive = false; };
    const h = setInterval(load, intervalMs);
    return () => { alive = false; clearInterval(h); };
  }, [wallet, intervalMs, tick]);

  return { data, error, refresh };
}
