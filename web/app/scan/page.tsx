"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { TxHash } from "@/components/Providers";

interface Result { tone: "ok" | "bad" | "info"; title: string; detail?: string; txHash?: string }

const REASONS: Record<string, string> = {
  malformed: "That is not a FairTix code.",
  bad_signature: "Fake or altered code.",
  expired: "Code expired. Ask the guest to reopen their pass.",
  not_owner: "Ticket was resold or listed since this code was made.",
  already_used: "This ticket was already scanned.",
};

export default function ScanPage() {
  const [pin, setPin] = useState("");
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState<"off" | "on" | "error">("off");
  const video = useRef<HTMLVideoElement>(null);
  const last = useRef({ code: "", at: 0 });
  const busyRef = useRef(false);
  const pinRef = useRef("");

  useEffect(() => {
    try { setPin(sessionStorage.getItem("gatePin") ?? ""); } catch {}
  }, []);
  useEffect(() => {
    pinRef.current = pin;
    try { sessionStorage.setItem("gatePin", pin); } catch {}
  }, [pin]);

  const submit = useCallback(async (code: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/ticket/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, pin: pinRef.current }) });
      const j = await r.json();
      if (!j.ok) setResult({ tone: "bad", title: "Scanner error", detail: j.error });
      else if (j.admitted) setResult({ tone: "ok", title: `ADMIT · Ticket #${j.tokenId}`, detail: "Entry recorded on-chain.", txHash: j.txHash });
      else setResult({ tone: "bad", title: `DENY${j.tokenId ? ` · Ticket #${j.tokenId}` : ""}`, detail: REASONS[j.reason] ?? j.reason });
    } catch (e) {
      setResult({ tone: "bad", title: "Scanner error", detail: (e as Error).message });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  // Camera loop: decode QR codes from video frames (works in every browser, no BarcodeDetector needed).
  useEffect(() => {
    if (camera !== "on") return;
    let stream: MediaStream | undefined;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const v = video.current!;
        v.srcObject = s;
        void v.play();
        const tick = () => {
          if (stopped) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA && ctx) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const q = jsQR(img.data, img.width, img.height);
            if (q?.data && (q.data !== last.current.code || Date.now() - last.current.at > 4000)) {
              last.current = { code: q.data, at: Date.now() };
              void submit(q.data);
            }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => setCamera("error"));
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [camera, submit]);

  const tone = result?.tone === "ok" ? "border-mint/60 bg-mint/10 text-mint" : result?.tone === "bad" ? "border-red-500/60 bg-red-500/10 text-red-300" : "border-edge bg-panel";

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <span className="chip">Gate staff</span>
        <h1 className="mt-3 font-display text-3xl font-bold">Ticket scanner</h1>
        <p className="mt-1 text-sm text-slate-400">Scan a guest&apos;s entry QR. Valid tickets are admitted once and recorded on-chain.</p>
      </div>

      <div className="card space-y-2">
        <label className="label" htmlFor="pin">Gate PIN</label>
        <input id="pin" type="password" className="input font-mono" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Enter the PIN from the organizer" />
      </div>

      <div className="card space-y-3">
        {camera === "on" ? (
          <>
            <video ref={video} muted playsInline className="aspect-square w-full rounded-xl bg-black object-cover" />
            <button className="btn-ghost w-full" onClick={() => setCamera("off")}>Stop camera</button>
          </>
        ) : (
          <button className="btn w-full" onClick={() => setCamera("on")} disabled={!pin}>
            {camera === "error" ? "Camera unavailable, retry" : "Start camera"}
          </button>
        )}
        {camera === "error" && <p className="text-xs text-amber-300">Could not open the camera. Allow camera access, or paste the code below.</p>}

        <div className="border-t border-edge pt-3">
          <label className="label" htmlFor="code">Or paste a code</label>
          <div className="mt-1.5 flex gap-2">
            <input id="code" className="input font-mono text-xs" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="FT1.…" />
            <button className="btn-ghost" disabled={!manual || !pin || busy} onClick={() => submit(manual)}>Check</button>
          </div>
        </div>
      </div>

      {(result || busy) && (
        <div role="status" className={`rounded-2xl border p-6 text-center ${busy ? "border-edge bg-panel text-slate-300" : tone}`}>
          {busy ? (
            <div className="font-semibold">Checking…</div>
          ) : (
            result && (
              <>
                <div className="font-display text-3xl font-bold">{result.title}</div>
                {result.detail && <div className="mt-1 text-sm opacity-90">{result.detail}</div>}
                {result.txHash && <div className="mt-2 text-xs text-slate-300">tx <TxHash hash={result.txHash} /></div>}
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
