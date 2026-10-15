import "server-only";
import { maxUint256 } from "viem";
import { abis, addr, accountFor, config, read, resolveWallet, send, walletFor } from "./chain";

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
