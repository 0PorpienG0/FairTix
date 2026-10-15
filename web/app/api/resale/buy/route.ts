import { NextResponse } from "next/server";
import { abis, addr, friendlyError, read, resolveWallet, send, walletFor } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { wallet, listingId } = (await req.json()) as { wallet: string; listingId: string | number };
    const w = resolveWallet(wallet);
    if (!w) return NextResponse.json({ ok: false, error: "Unknown wallet" }, { status: 400 });
    const id = BigInt(listingId);
    const l = await read<readonly [string, bigint, bigint, boolean]>(addr.market, abis.market, "listings", [id]);
    const price = l[2];
    if (!l[3]) return NextResponse.json({ ok: false, error: "Listing is no longer active" }, { status: 400 });
    const wc = walletFor(w.name);
    const hashes: string[] = [];
    const allowance = await read<bigint>(addr.usdc, abis.usdc, "allowance", [w.address, addr.market]);
    if (allowance < price) {
      hashes.push(await send(wc, { address: addr.usdc, abi: abis.usdc, functionName: "approve", args: [addr.market, price] }));
    }
    hashes.push(await send(wc, { address: addr.market, abi: abis.market, functionName: "buy", args: [id] }));
    return NextResponse.json({ ok: true, txHash: hashes[hashes.length - 1], txHashes: hashes });
  } catch (e) {
    return NextResponse.json({ ok: false, ...friendlyError(e) }, { status: 400 });
  }
}
