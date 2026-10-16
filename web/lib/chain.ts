import "server-only";
import { createPublicClient, createWalletClient, defineChain, http, BaseError, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import deployment from "../../shared/deployment.json";
import keys from "../../shared/demo-keys.json";
import config from "../../shared/config.json";
import usdcAbi from "../../shared/abi/MockUSDC.json";
import ticketAbi from "../../shared/abi/TicketNFT.json";
import primaryAbi from "../../shared/abi/PrimarySale.json";
import marketAbi from "../../shared/abi/Marketplace.json";
import checkInAbi from "../../shared/abi/CheckIn.json";

export { config };
export const dep = deployment as typeof deployment;
export const abis = {
  usdc: usdcAbi as Abi,
  ticket: ticketAbi as Abi,
  primary: primaryAbi as Abi,
  market: marketAbi as Abi,
  checkIn: checkInAbi as Abi,
};
export const addr = {
  usdc: dep.usdc as Address,
  ticket: dep.ticket as Address,
  primary: dep.primarySale as Address,
  market: dep.marketplace as Address,
  checkIn: dep.checkIn as Address,
};

const rpcUrl = process.env.RPC_URL || dep.rpcUrl;
export const chain = defineChain({
  id: dep.chainId,
  name: dep.chainId === 31337 ? "Local Hardhat" : dep.chainId === 43113 ? "Avalanche Fuji" : dep.chainId === 84532 ? "Base Sepolia" : `Chain ${dep.chainId}`,
  nativeCurrency: dep.chainId === 43113 ? { name: "Avalanche", symbol: "AVAX", decimals: 18 } : { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  // Multicall3 is deployed at this address on Base, Base Sepolia and Avalanche (Fuji); the local Hardhat chain has none.
  ...(dep.chainId === 31337 ? {} : { contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" as Address } } }),
});
// Reads made in the same tick are batched into one Multicall3 eth_call: /api/state does dozens of reads per poll,
// which otherwise trips the free-tier request-rate limit of private RPCs.
export const publicClient = createPublicClient({ chain, transport: http(rpcUrl), batch: dep.chainId === 31337 ? undefined : { multicall: { wait: 16 } } });
// Log queries use a separate endpoint: free private RPC tiers (e.g. Alchemy: 10-block eth_getLogs range) reject
// the wide pages we scan with, so they default to the deployment's public RPC even when RPC_URL is a private one.
// The official Fuji endpoint caps getLogs at 100 blocks; publicnode allows 50k.
const logRpcUrl = process.env.LOGS_RPC_URL || (dep.chainId === 43113 ? "https://avalanche-fuji-c-chain-rpc.publicnode.com" : dep.rpcUrl);
const LOG_STEP = BigInt(process.env.LOG_STEP || (dep.chainId === 43113 ? 40000 : 190));
const logClient = createPublicClient({ chain, transport: http(logRpcUrl, { retryCount: 6, retryDelay: 400 }) });

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

/** Signed-in users (Clerk ids look like "user_2abc…") get a wallet derived from a server secret: no database needed. */
export const isUserId = (name: string) => name.startsWith("user_");
function derivedKey(userId: string): Hex {
  const secret = process.env.WALLET_MASTER_SECRET;
  if (!secret) throw new Error("WALLET_MASTER_SECRET is not set");
  return `0x${createHmac("sha256", secret).update(userId).digest("hex")}`;
}
export function userWallet(userId: string): { name: string; address: Address } {
  return { name: userId, address: privateKeyToAccount(derivedKey(userId)).address };
}

export function accountFor(name: string) {
  if (isUserId(name)) return privateKeyToAccount(derivedKey(name));
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
  // Never echo the RPC URL: private endpoints carry an API key.
  if (/429|rate limit|too many requests|capacity/i.test(msg)) return { error: "The blockchain node is busy. Please try again in a few seconds." };
  if (/fetch failed|ECONNREFUSED|HTTP request failed|timed out/i.test(msg)) return { error: "Cannot reach the blockchain node right now. Please try again in a moment." };
  if (/insufficient|exceeds balance/i.test(msg)) return { error: `Insufficient USDC balance. (${msg})` };
  const safe = msg.replace(/https?:\/\/\S+/g, "<url>");
  return { error: name ? `${name}: ${safe}` : safe, errorName: name };
}

/**
 * Event logs from deployBlock to head, fetched in <=190-block pages (public RPCs cap eth_getLogs ranges)
 * with an in-memory cursor so each call only scans new blocks.
 */
type EventLog = { args: unknown; transactionHash: string; blockNumber: bigint };
const logCache = new Map<string, { to: bigint; logs: unknown[] }>();
const scanning = new Map<string, Promise<EventLog[]>>();

export function getEvents(address: Address, abi: Abi, eventName: string): Promise<EventLog[]> {
  const key = `${address}:${eventName}`;
  // Concurrent callers (several pages poll at once) share one scan instead of multiplying the RPC load.
  let p = scanning.get(key);
  if (!p) {
    p = scanEvents(key, address, abi, eventName).finally(() => scanning.delete(key));
    scanning.set(key, p);
  }
  return p;
}

async function scanEvents(key: string, address: Address, abi: Abi, eventName: string): Promise<EventLog[]> {
  const head = await logClient.getBlockNumber();
  const c = logCache.get(key) ?? { to: deployBlock - 1n, logs: [] };
  const STEP = LOG_STEP;
  const BATCH = 4;
  const ranges: [bigint, bigint][] = [];
  for (let f = c.to + 1n; f <= head; f += STEP) ranges.push([f, f + STEP - 1n > head ? head : f + STEP - 1n]);

  // Dedupe by (tx, logIndex): the overlap below deliberately refetches the newest blocks.
  const merge = (base: unknown[], extra: unknown[][]) => {
    const seen = new Set<string>();
    return base.concat(...extra).filter((l) => {
      const { transactionHash, logIndex } = l as { transactionHash: string; logIndex: number };
      const id = `${transactionHash}:${logIndex}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };
  const save = (to: bigint, logs: unknown[]) => {
    const cur = logCache.get(key);
    if (!cur || cur.to < to) logCache.set(key, { to, logs }); // never move the cursor backwards
  };

  let to = c.to;
  let logs = c.logs;
  for (let i = 0; i < ranges.length; i += BATCH) {
    const slice = ranges.slice(i, i + BATCH);
    try {
      const got = await Promise.all(slice.map(([f, t]) => logClient.getContractEvents({ address, abi, eventName, fromBlock: f, toBlock: t })));
      logs = merge(logs, got);
      to = slice[slice.length - 1][1];
      save(to, logs);
    } catch (e) {
      // Public RPCs rate-limit big scans (HTTP 429). Progress so far is kept, so the next call resumes where this one stopped.
      throw e;
    }
  }
  // Public RPCs sit behind load balancers whose nodes lag each other, so keep a 15-block overlap:
  // the next call refetches the tail (deduped above) and cannot miss logs a lagging node hadn't seen yet.
  save(head > c.to + 15n ? head - 15n : c.to, logs);
  return logs as never;
}
