import { NextResponse } from "next/server";
import { abis, addr, friendlyError, send, walletFor } from "@/lib/chain";
import { ensureGas, identify } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { wallet, listingId } = (await req.json()) as { wallet?: string; listingId: string | number };
    const w = await identify(wallet);
    if (!w) return NextResponse.json({ ok: false, error: "Please sign in" }, { status: 401 });
    await ensureGas(w.address);
    const txHash = await send(walletFor(w.name), { address: addr.market, abi: abis.market, functionName: "cancel", args: [BigInt(listingId)] });
    return NextResponse.json({ ok: true, txHash });
  } catch (e) {
    return NextResponse.json({ ok: false, ...friendlyError(e) }, { status: 400 });
  }
}
