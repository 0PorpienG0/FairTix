import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { abis, addr, friendlyError, send, walletFor } from "@/lib/chain";
import { checkCode } from "@/lib/qr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function pinOk(given: string) {
  const pin = process.env.GATE_PIN;
  if (!pin) return null;
  const a = Buffer.from(given);
  const b = Buffer.from(pin);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Gate scanner: validates a scanned code and, unless admit=false, records the entry on-chain (once per ticket). */
export async function POST(req: Request) {
  try {
    const { code, pin, admit = true } = (await req.json()) as { code?: string; pin?: string; admit?: boolean };
    const ok = pinOk(pin ?? "");
    if (ok === null) return NextResponse.json({ ok: false, error: "Gate PIN is not configured on the server" }, { status: 503 });
    if (!ok) return NextResponse.json({ ok: false, error: "Wrong gate PIN" }, { status: 401 });

    const r = await checkCode(code ?? "");
    if (!r.ok) return NextResponse.json({ ok: true, admitted: false, reason: r.reason, tokenId: r.tokenId });
    if (!admit) return NextResponse.json({ ok: true, admitted: false, reason: "valid", tokenId: r.tokenId });

    const txHash = await send(walletFor("treasury"), { address: addr.checkIn, abi: abis.checkIn, functionName: "checkIn", args: [BigInt(r.tokenId)] });
    return NextResponse.json({ ok: true, admitted: true, tokenId: r.tokenId, txHash });
  } catch (e) {
    const f = friendlyError(e);
    if (/AlreadyUsed/.test(f.error)) return NextResponse.json({ ok: true, admitted: false, reason: "already_used" });
    return NextResponse.json({ ok: false, ...f }, { status: 500 });
  }
}
