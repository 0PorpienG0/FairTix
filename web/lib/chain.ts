import "server-only";
import { createPublicClient, createWalletClient, defineChain, http, BaseError, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

/** Local chain: public Hardhat demo keys. Testnet: TESTNET_KEYS_JSON env (hosting) or shared/testnet-keys.json (gitignored). */
function loadKeys(): KeyMap {
  if (dep.chainId === 31337) return keys as unknown as KeyMap;
  if (process.env.TESTNET_KEYS_JSON) {
    const parsed = JSON.parse(process.env.TESTNET_KEYS_JSON.trim());
    return (typeof parsed === "string" ? JSON.parse(parsed) : parsed) as KeyMap;
  }
  const f = join(process.cwd(), "..", "shared", "testnet-keys.json");
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8")) as KeyMap;
  throw new Error("Testnet keys missing: run the deploy script or set TESTNET_KEYS_JSON");
}
// Loaded lazily so `next build` can collect page data without the secret env present.
let cachedKeys: KeyMap | null = null;
const getKeyMap = (): KeyMap => (cachedKeys ??= loadKeys());

export function accountFor(name: string) {
  const k = name === "treasury" && process.env.TREASURY_PRIVATE_KEY ? process.env.TREASURY_PRIVATE_KEY : getKeyMap()[name]?.privateKey;
  if (!k) throw new Error(`No demo key for "${name}"`);
  return privateKeyToAccount(k as Hex);
}
export function walletFor(name: string) {
  return createWalletClient({ account: accountFor(name), chain, transport: http(rpcUrl) });
}

/** Resolve "alice" | "bob" | 0x address to {name,address}. */
export function resolveWallet(w: string): { name: string; address: Address } | null {
  const lower = w.toLowerCase();
  const keyMap = getKeyMap();
  for (const n of Object.keys(keyMap)) {
    if (n === lower || keyMap[n].address.toLowerCase() === lower) return { name: n, address: keyMap[n].address as Address };
  }
  return null;
}
export function nameOf(address: string): string | null {
  const l = address.toLowerCase();
  const keyMap = getKeyMap();
  for (const n of Object.keys(keyMap)) if (keyMap[n].address.toLowerCase() === l) return n;
  return null;
}

type WC = ReturnType<typeof walletFor>;
export const deployBlock = BigInt((dep as { deployBlock?: string }).deployBlock ?? "0");

/** Simulate (surfaces custom-error reverts), send, and wait for receipt. */
export async function send(wc: WC, p: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] }): Promise<Hex> {
  // Load-balanced public RPCs may not see a just-mined approve() yet: retry allowance/approval reverts briefly.
  let request: unknown;
  for (let i = 0; ; i++) {
    try {
      ({ request } = await publicClient.simulateContract({ account: wc.account, ...p } as never));
      break;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (i < 12 && /InsufficientAllowance|InsufficientApproval|0xfb8f41b2|0x177e802f/.test(m)) { await new Promise((r) => setTimeout(r, 700)); continue; }
      throw e;
    }
  }
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
  const capped = config.resaleCapBps > 0;
  switch (name) {
    case "PriceAboveCap":
      return { errorName: name, error: capped ? `Price exceeds the resale cap of ${cap}` : "Price rejected by the marketplace" };
    case "PriceTooLow":
      return { errorName: name, error: `Price too low: must be greater than zero` };
    case "SoldOut":
      return { errorName: name, error: "Sold out" };
  }
  if (/fetch failed|ECONNREFUSED|HTTP request failed/i.test(msg)) return { error: `Cannot reach chain RPC at ${rpcUrl}. Is the local node running?` };
  if (/insufficient|exceeds balance/i.test(msg)) return { error: `Insufficient USDC balance. (${msg})` };
  return { error: name ? `${name}: ${msg}` : msg, errorName: name };
}

/**
 * Event logs from deployBlock to head, fetched in <=190-block pages (public RPCs cap eth_getLogs ranges)
 * with an in-memory cursor so each call only scans new blocks.
 */
const logCache = new Map<string, { to: bigint; logs: unknown[] }>();
export async function getEvents(address: Address, abi: Abi, eventName: string): Promise<{ args: unknown; transactionHash: string; blockNumber: bigint }[]> {
  const key = `${address}:${eventName}`;
  const head = await publicClient.getBlockNumber();
  const c = logCache.get(key) ?? { to: deployBlock - 1n, logs: [] };
  const STEP = 190n;
  const ranges: [bigint, bigint][] = [];
  for (let f = c.to + 1n; f <= head; f += STEP) ranges.push([f, f + STEP - 1n > head ? head : f + STEP - 1n]);
  const pages: unknown[][] = [];
  for (let i = 0; i < ranges.length; i += 8) {
    const batch = await Promise.all(ranges.slice(i, i + 8).map(([f, t]) => publicClient.getContractEvents({ address, abi, eventName, fromBlock: f, toBlock: t })));
    pages.push(...batch);
  }
  const logs = c.logs.concat(...pages);
  logCache.set(key, { to: head, logs });
  return logs as never;
}
