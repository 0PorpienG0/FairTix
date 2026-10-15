export function usd(micro: string | bigint | number, opts?: { sign?: boolean }): string {
  const v = typeof micro === "bigint" ? micro : BigInt(micro);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  const body = `$${whole.toLocaleString("en-US")}.${frac}`;
  return neg ? `-${body}` : opts?.sign ? `+${body}` : body;
}

/** Parse a user-entered dollar string to micro-USDC. Returns null if invalid. */
export function parseUsd(s: string): bigint | null {
  const t = s.trim().replace(/^\$/, "");
  if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  return BigInt(w) * 1_000_000n + BigInt(f.padEnd(6, "0"));
}

import config from "../../shared/config.json";

export const ROYALTY_BPS = BigInt(config.royaltyBps);
export const FEE_BPS = BigInt(config.resaleFeeBps);
export const CAP_BPS = Number(config.resaleCapBps);

/** Resale split, same rounding as the Marketplace contract: integer division, seller gets the remainder. */
export function splitResale(price: bigint, royaltyBps: bigint = ROYALTY_BPS, feeBps: bigint = FEE_BPS) {
  const royalty = (price * royaltyBps) / 10000n;
  const fee = (price * feeBps) / 10000n;
  return { royalty, fee, seller: price - royalty - fee };
}

export function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER_URL || "";
export function txUrl(hash: string): string | null {
  return EXPLORER ? `${EXPLORER.replace(/\/$/, "")}/tx/${hash}` : null;
}
