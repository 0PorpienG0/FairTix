import { NextResponse } from "next/server";
import type { Address } from "viem";
import { abis, addr, config, dep, friendlyError, maxPriceMicro, nameOf, publicClient, read, resolveWallet } from "@/lib/chain";
import type { Listing, ResaleEvent, SaleEvent, StateResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

type Args = Record<string, unknown>;
const argsOf = (l: unknown) => (l as { args: Args }).args;

export async function GET(req: Request) {
  try {
    const w = new URL(req.url).searchParams.get("wallet");
    const me = w ? resolveWallet(w) : null;
    const bal = (a: string) => read<bigint>(addr.usdc, abis.usdc, "balanceOf", [a]);

    const [organizer, platform, artist, sold, nextId, block, saleLogs, resaleLogs] = await Promise.all([
      bal(dep.accounts.organizer),
      bal(dep.accounts.platform),
      bal(dep.accounts.artist),
      read<bigint>(addr.primary, abis.primary, "sold"),
      read<bigint>(addr.market, abis.market, "nextListingId"),
      publicClient.getBlockNumber(),
      publicClient.getContractEvents({ address: addr.primary, abi: abis.primary, eventName: "TicketSold", fromBlock: 0n }),
      publicClient.getContractEvents({ address: addr.market, abi: abis.market, eventName: "Sold", fromBlock: 0n }),
    ]);

    const sales: SaleEvent[] = saleLogs
      .map((l) => {
        const a = argsOf(l);
        return {
          buyer: a.buyer as string, buyerName: nameOf(a.buyer as string), tokenId: String(a.tokenId),
          organizerAmount: String(a.organizerAmount), platformAmount: String(a.platformAmount),
          txHash: l.transactionHash as string, block: String(l.blockNumber),
        };
      })
      .reverse();

    const resales: ResaleEvent[] = resaleLogs
      .map((l) => {
        const a = argsOf(l);
        return {
          listingId: String(a.listingId), buyer: a.buyer as string, tokenId: String(a.tokenId), price: String(a.price),
          royalty: String(a.royalty), fee: String(a.fee), sellerProceeds: String(a.sellerProceeds),
          txHash: l.transactionHash as string, block: String(l.blockNumber),
        };
      })
      .reverse();

    const ids = Array.from({ length: Number(nextId) }, (_, i) => BigInt(i));
    const rows = await Promise.all(ids.map((id) => read<readonly [string, bigint, bigint, boolean]>(addr.market, abis.market, "listings", [id])));
    const listings: Listing[] = [];
    rows.forEach((r, i) => {
      if (r[3]) listings.push({ id: String(ids[i]), seller: r[0], sellerName: nameOf(r[0]), tokenId: String(r[1]), price: String(r[2]), active: true });
    });

    let tickets: { tokenId: string }[] = [];
    let walletInfo: StateResponse["wallet"] = null;
    if (me) {
      const owners = await Promise.all(
        sales.map((s) =>
          read<string>(addr.ticket, abis.ticket, "ownerOf", [BigInt(s.tokenId)])
            .then((o) => ({ id: s.tokenId, o }))
            .catch(() => ({ id: s.tokenId, o: "" })),
        ),
      );
      tickets = owners
        .filter((x) => x.o.toLowerCase() === me.address.toLowerCase())
        .map((x) => ({ tokenId: x.id }))
        .sort((a, b) => Number(a.tokenId) - Number(b.tokenId));
      walletInfo = { name: me.name, address: me.address as Address, usdc: String(await bal(me.address)) };
    }

    const mine = (l: Listing) => !!me && l.seller.toLowerCase() === me.address.toLowerCase();
    const body: StateResponse = {
      wallet: walletInfo,
      tickets,
      listings: listings.filter((l) => !mine(l)),
      myListings: listings.filter(mine),
      balances: { organizer: String(organizer), platform: String(platform), artist: String(artist) },
      sales, resales,
      sold: String(sold), maxSupply: config.maxSupply, maxPrice: String(maxPriceMicro()),
      stripeEnabled: !!process.env.STRIPE_SECRET_KEY, block: String(block),
    };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ ok: false, ...friendlyError(e) }, { status: 500 });
  }
}
