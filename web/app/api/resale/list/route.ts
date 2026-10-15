import { NextResponse } from "next/server";
import { abis, addr, friendlyError, read, send, walletFor } from "@/lib/chain";
import { ensureGas, identify } from "@/lib/identity";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { wallet, tokenId, price } = (await req.json()) as { wallet?: string; tokenId: string | number; price: string | number };
    const w = await identify(wallet);
    if (!w) return NextResponse.json({ ok: false, error: "Please sign in" }, { status: 401 });
    const id = BigInt(tokenId);
    if (await read<boolean>(addr.checkIn, abis.checkIn, "used", [id])) {
      return NextResponse.json({ ok: false, error: "This ticket was already used at the gate and can't be resold" }, { status: 400 });
    }
    await ensureGas(w.address);
    const wc = walletFor(w.name);
    const hashes: string[] = [];

    const approved = await read<string>(addr.ticket, abis.ticket, "getApproved", [id]);
    if (approved.toLowerCase() !== addr.market.toLowerCase()) {
      hashes.push(await send(wc, { address: addr.ticket, abi: abis.ticket, functionName: "approve", args: [addr.market, id] }));
      // public testnet RPCs are load balanced: wait until the approval is visible before simulating list()
      for (let i = 0; i < 20; i++) {
        const now = await read<string>(addr.ticket, abis.ticket, "getApproved", [id]);
        if (now.toLowerCase() === addr.market.toLowerCase()) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    // simulate-then-send: contract reverts (e.g. PriceAboveCap if a cap is ever configured) surface as friendly errors
    hashes.push(await send(wc, { address: addr.market, abi: abis.market, functionName: "list", args: [id, BigInt(price)] }));
    return NextResponse.json({ ok: true, txHash: hashes[hashes.length - 1], txHashes: hashes });
  } catch (e) {
    return NextResponse.json({ ok: false, ...friendlyError(e) }, { status: 400 });
  }
}
