import "server-only";
import { maxUint256 } from "viem";
import { abis, addr, accountFor, config, read, resolveWallet, send, walletFor } from "./chain";
import { ensureGas } from "./identity";

/**
 * Stands in for "Stripe fiat -> USDC": the treasury wallet pays the $50 face value
 * in USDC to PrimarySale, which splits $49 organizer / $1 platform and mints to buyer.
 */
export async function fulfil(buyerRef: string): Promise<{ txHash: `0x${string}`; buyer: string }> {
  const buyer = resolveWallet(buyerRef)?.address ?? (/^0x[0-9a-fA-F]{40}$/.test(buyerRef) ? (buyerRef as `0x${string}`) : null);
  if (!buyer) throw new Error(`Unknown buyer "${buyerRef}"`);

  const wc = walletFor("treasury");
  const treasury = accountFor("treasury").address;
  const face = BigInt(config.faceValue);

  const bal = await read<bigint>(addr.usdc, abis.usdc, "balanceOf", [treasury]);
  if (bal < face) {
    // MockUSDC has a public mint on local/testnet: top up the treasury.
    await send(wc, { address: addr.usdc, abi: abis.usdc, functionName: "mint", args: [treasury, face * 100n] });
  }
  const allowance = await read<bigint>(addr.usdc, abis.usdc, "allowance", [treasury, addr.primary]);
  if (allowance < face) {
    await send(wc, { address: addr.usdc, abi: abis.usdc, functionName: "approve", args: [addr.primary, maxUint256] });
  }
  const txHash = await send(wc, { address: addr.primary, abi: abis.primary, functionName: "buyFor", args: [buyer] });
  return { txHash, buyer };
}

type Listing = readonly [string, bigint, bigint, boolean]; // seller, tokenId, price, active
export const listingOf = (id: bigint) => read<Listing>(addr.market, abis.market, "listings", [id]);
export const usdcOf = (a: string) => read<bigint>(addr.usdc, abis.usdc, "balanceOf", [a]);

/** Stands in for "card -> USDC" on a resale: the treasury sends `amount` USDC to the buyer's wallet. */
export async function creditUsdc(to: string, amount: bigint): Promise<void> {
  const wc = walletFor("treasury");
  const treasury = accountFor("treasury").address;
  if ((await usdcOf(treasury)) < amount) {
    await send(wc, { address: addr.usdc, abi: abis.usdc, functionName: "mint", args: [treasury, amount * 100n] });
  }
  await send(wc, { address: addr.usdc, abi: abis.usdc, functionName: "transfer", args: [to, amount] });
}

/**
 * Buy a resale listing as `buyerName`, paying from that wallet's USDC.
 * `topUp` first credits any shortfall (used after a card payment or in demo mode).
 */
export async function buyListing(buyerName: string, buyerAddress: `0x${string}`, listingId: bigint, topUp = false): Promise<string[]> {
  const l = await listingOf(listingId);
  if (!l[3]) throw new Error("Listing is no longer active");
  const price = l[2];
  const bal = await usdcOf(buyerAddress);
  if (bal < price) {
    if (!topUp) throw new Error("Insufficient USDC balance");
    await creditUsdc(buyerAddress, price - bal);
  }
  await ensureGas(buyerAddress);
  const wc = walletFor(buyerName);
  const hashes: string[] = [];
  if ((await read<bigint>(addr.usdc, abis.usdc, "allowance", [buyerAddress, addr.market])) < price) {
    hashes.push(await send(wc, { address: addr.usdc, abi: abis.usdc, functionName: "approve", args: [addr.market, price] }));
  }
  hashes.push(await send(wc, { address: addr.market, abi: abis.market, functionName: "buy", args: [listingId] }));
  return hashes;
}
