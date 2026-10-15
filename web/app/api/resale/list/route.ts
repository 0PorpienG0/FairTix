import { NextResponse } from "next/server";
import { abis, addr, friendlyError, read, resolveWallet, send, walletFor } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { wallet, tokenId, price } = (await req.json()) as { wallet: string; tokenId: string | number; price: string | number };
    const w = resolveWallet(wallet);
    if (!w) return NextResponse.json({ ok: false, error: "Unknown wallet" }, { status: 400 });
    const id = BigInt(tokenId);
    const wc = walletFor(w.name);
    const hashes: string[] = [];

    const approved = await read<string>(addr.ticket, abis.ticket, "getApproved", [id]);
    if (approved.toLowerCase() !== addr.market.toLowerCase()) {
      hashes.push(await send(wc, { address: addr.ticket, abi: abis.ticket, functionName: "approve", args: [addr.market, id] }));
    }
    // simulate-then-send: a price above the cap surfaces the contract's PriceAboveCap revert
    hashes.push(await send(wc, { address: addr.market, abi: abis.market, functionName: "list", args: [id, BigInt(price)] }));
    return NextResponse.json({ ok: true, txHash: hashes[hashes.length - 1], txHashes: hashes });
  } catch (e) {
    return NextResponse.json({ ok: false, ...friendlyError(e) }, { status: 400 });
  }
}
