import "server-only";
import { createPublicClient, createWalletClient, defineChain, http, BaseError, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import deployment from "../../shared/deployment.json";
import keys from "../../shared/demo-keys.json";
import config from "../../shared/config.json";
import usdcAbi from "../../shared/abi/MockUSDC.json";
import ticketAbi from "../../shared/abi/TicketNFT.json";
import primaryAbi from "../../shared/abi/PrimarySale.json";
import marketAbi from "../../shared/abi/Marketplace.json";

export { config };
export const dep = deployment as typeof deployment;
export const abis = {
  usdc: usdcAbi as Abi,
  ticket: ticketAbi as Abi,
  primary: primaryAbi as Abi,
  market: marketAbi as Abi,
};
export const addr = {
  usdc: dep.usdc as Address,
  ticket: dep.ticket as Address,
  primary: dep.primarySale as Address,
  market: dep.marketplace as Address,
};

const rpcUrl = process.env.RPC_URL || dep.rpcUrl;
export const chain = defineChain({
  id: dep.chainId,
  name: dep.chainId === 31337 ? "Local Hardhat" : `Chain ${dep.chainId}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

type KeyMap = Record<string, { address: string; privateKey: string }>;
const keyMap = keys as unknown as KeyMap;

export function accountFor(name: string) {
  const k = name === "treasury" && process.env.TREASURY_PRIVATE_KEY ? process.env.TREASURY_PRIVATE_KEY : keyMap[name]?.privateKey;
  if (!k) throw new Error(`No demo key for "${name}"`);
  return privateKeyToAccount(k as Hex);
}
export function walletFor(name: string) {
  return createWalletClient({ account: accountFor(name), chain, transport: http(rpcUrl) });
}

/** Resolve "alice" | "bob" | 0x address to {name,address}. */
export function resolveWallet(w: string): { name: string; address: Address } | null {
  const lower = w.toLowerCase();
  for (const n of Object.keys(keyMap)) {
    if (n === lower || keyMap[n].address.toLowerCase() === lower) return { name: n, address: keyMap[n].address as Address };
  }
  return null;
}
export function nameOf(address: string): string | null {
  const l = address.toLowerCase();
  for (const n of Object.keys(keyMap)) if (keyMap[n].address.toLowerCase() === l) return n;
  return null;
}

type WC = ReturnType<typeof walletFor>;
/** Simulate (surfaces custom-error reverts), send, and wait for receipt. */
export async function send(wc: WC, p: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }): Promise<Hex> {
  const { request } = await publicClient.simulateContract({ account: wc.account, ...p } as never);
  const hash = await wc.writeContract(request as never);
  const rcpt = await publicClient.waitForTransactionReceipt({ hash });
  if (rcpt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return hash;
}

export const read = <T = unknown>(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) =>
  publicClient.readContract({ address, abi, functionName, args } as never) as Promise<T>;

export function maxPriceMicro(): bigint {
  return (BigInt(config.faceValue) * BigInt(config.resaleCapBps)) / 10000n;
}

function usdStr(micro: bigint) {
  const w = micro / 1_000_000n;
  const f = micro % 1_000_000n;
  return f === 0n ? `$${w}` : `$${w}.${f.toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0")}`;
}

const KNOWN = /\b(PriceAboveCap|PriceTooLow|SoldOut)\b/;

/** Turn any viem/contract error into a human-readable message. */
export function friendlyError(e: unknown): { error: string; errorName?: string } {
  let name: string | undefined;
  let msg = e instanceof Error ? e.message : String(e);
  if (e instanceof BaseError) {
    const inner = e.walk((x) => typeof (x as { data?: { errorName?: string } }).data?.errorName === "string") as { data?: { errorName?: string } } | null;
    name = inner?.data?.errorName;
    msg = e.shortMessage || msg;
    if (!name) name = (e.message + " " + (e.details ?? "")).match(KNOWN)?.[1];
  }
  if (!name) name = msg.match(KNOWN)?.[1];
  const cap = usdStr(maxPriceMicro());
  switch (name) {
    case "PriceAboveCap":
      return { errorName: name, error: `Price exceeds ${config.resaleCapBps / 100}% cap of ${cap}` };
    case "PriceTooLow":
      return { errorName: name, error: `Price too low: must cover the ${usdStr(BigInt(config.royaltyFlat) + BigInt(config.resaleFeeFlat))} royalty + platform fee` };
    case "SoldOut":
      return { errorName: name, error: "Sold out" };
  }
  if (/fetch failed|ECONNREFUSED|HTTP request failed/i.test(msg)) return { error: `Cannot reach chain RPC at ${rpcUrl}. Is the local node running?` };
  if (/insufficient|exceeds balance/i.test(msg)) return { error: `Insufficient USDC balance. (${msg})` };
  return { error: name ? `${name}: ${msg}` : msg, errorName: name };
}
