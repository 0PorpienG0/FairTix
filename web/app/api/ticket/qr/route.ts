import { NextResponse } from "next/server";
import { abis, addr, friendlyError, read } from "@/lib/chain";
import { identify } from "@/lib/identity";
import { issueCode } from "@/lib/qr";

export const dynamic = "force-dynamic";

/** Entry QR for a ticket the signed-in user owns. Call again before `expiresAt` for a fresh code. */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const me = await identify(q.get("wallet"));
    if (!me) return NextResponse.json({ ok: false, error: "Please sign in" }, { status: 401 });
    const tokenId = q.get("tokenId") ?? "";
    if (!/^\d+$/.test(tokenId)) return NextResponse.json({ ok: false, error: "Bad ticket id" }, { status: 400 });

    const [owner, used] = await Promise.all([
      read<string>(addr.ticket, abis.ticket, "ownerOf", [BigInt(tokenId)]).catch(() => ""),
      read<boolean>(addr.checkIn, abis.checkIn, "used", [BigInt(tokenId)]),
    ]);
    if (owner.toLowerCase() !== me.address.toLowerCase()) return NextResponse.json({ ok: false, error: "This ticket is not in your wallet" }, { status: 403 });
    if (used) return NextResponse.json({ ok: true, used: true });
    return NextResponse.json({ ok: true, used: false, ...issueCode(tokenId, me.address) });
  } catch (e) {
    return NextResponse.json({ ok: false, ...friendlyError(e) }, { status: 500 });
  }
}
