import { NextResponse } from "next/server";
import { abis, addr, friendlyError, resolveWallet, send, walletFor } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { wallet, listingId } = (await req.json()) as { wallet: string; listingId: string | number };
    const w = resolveWallet(wallet);
    if (!w) return NextResponse.json({ ok: false, error: "Unknown wallet" }, { status: 400 });
    const txHash = await send(walletFor(w.name), { address: addr.market, abi: abis.market, functionName: "cancel", args: [BigInt(listingId)] });
    return NextResponse.json({ ok: true, txHash });
  } catch (e) {
    return NextResponse.json({ ok: false, ...friendlyError(e) }, { status: 400 });
  }
}
