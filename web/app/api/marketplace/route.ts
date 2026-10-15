import { NextResponse } from "next/server";
import { abis, addr, getEvents, config, friendlyError, maxPriceMicro, nameOf, publicClient, read } from "@/lib/chain";
import type { Listing, MarketplaceResponse, MarketResale } from "@/lib/types";

export const dynamic = "force-dynamic";

type Args = Record<string, unknown>;
const argsOf = (l: unknown) => (l as { args: Args }).args;

/** All active resale listings (including the caller's), recent resales and aggregate stats. */
export async function GET() {
  try {
    const [nextId, block, resaleLogs] = await Promise.all([
      read<bigint>(addr.market, abis.market, "nextListingId"),
      publicClient.getBlockNumber(),
      getEvents(addr.market, abis.market, "Sold"),
    ]);

    const resales: MarketResale[] = resaleLogs
      .map((l) => {
        const a = argsOf(l);
        return {
          listingId: String(a.listingId), buyer: a.buyer as string, buyerName: nameOf(a.buyer as string),
          tokenId: String(a.tokenId), price: String(a.price), royalty: String(a.royalty), fee: String(a.fee),
          sellerProceeds: String(a.sellerProceeds), txHash: l.transactionHash as string, block: String(l.blockNumber),
        };
      })
      .reverse();

    const ids = Array.from({ length: Number(nextId) }, (_, i) => BigInt(i));
    const rows = await Promise.all(ids.map((id) => read<readonly [string, bigint, bigint, boolean]>(addr.market, abis.market, "listings", [id])));
    const listings: Listing[] = [];
    rows.forEach((r, i) => {
      if (r[3]) listings.push({ id: String(ids[i]), seller: r[0], sellerName: nameOf(r[0]), tokenId: String(r[1]), price: String(r[2]), active: true });
    });

    const floor = listings.reduce<bigint | null>((m, l) => (m === null || BigInt(l.price) < m ? BigInt(l.price) : m), null);
    const volume = resales.reduce((s, r) => s + BigInt(r.price), 0n);

    const body: MarketplaceResponse = {
      listings, resales,
      stats: { activeCount: listings.length, cap: String(maxPriceMicro()), floor: floor === null ? null : String(floor), totalResales: resales.length, totalVolume: String(volume) },
      faceValue: config.faceValue, eventName: config.eventName, royaltyBps: config.royaltyBps, feeBps: config.resaleFeeBps, capBps: config.resaleCapBps,
      block: String(block),
    };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ ok: false, ...friendlyError(e) }, { status: 500 });
  }
}
