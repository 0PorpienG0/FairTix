import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Address } from "viem";
import { abis, addr, read } from "./chain";

/** A code is valid for TTL_MS after it was issued (strict). The pass screen fetches a new one every REFRESH_MS. */
export const TTL_MS = 30_000;
export const REFRESH_MS = 15_000;
const SKEW_MS = 3_000; // tolerated clock difference between server instances
const PREFIX = "FT1";

function key() {
  const base = process.env.QR_SECRET || process.env.WALLET_MASTER_SECRET;
  if (!base) throw new Error("QR_SECRET (or WALLET_MASTER_SECRET) is not set");
  return createHmac("sha256", base).update("fairtix-entry-qr-v1").digest();
}
const sign = (tokenId: string, owner: string, ts: number) =>
  createHmac("sha256", key()).update(`${tokenId}.${owner}.${ts}`).digest("hex").slice(0, 32);

/** Code = FT1.<tokenId>.<owner>.<issuedAtSeconds>.<signature>: proves the ticket's owner asked for it less than TTL ago. */
export function issueCode(tokenId: string, owner: Address, now = Date.now()) {
  const o = owner.toLowerCase().slice(2);
  const ts = Math.floor(now / 1000);
  return { code: `${PREFIX}.${tokenId}.${o}.${ts}.${sign(tokenId, o, ts)}`, issuedAt: ts * 1000, expiresAt: ts * 1000 + TTL_MS, refreshAt: ts * 1000 + REFRESH_MS };
}

export type Check =
  | { ok: true; tokenId: string; owner: Address }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "not_owner" | "already_used"; tokenId?: string };

export async function checkCode(raw: string, now = Date.now()): Promise<Check> {
  const [p, tokenId, o, t, sig] = raw.trim().split(".");
  if (p !== PREFIX || !/^\d+$/.test(tokenId ?? "") || !/^[0-9a-f]{40}$/.test(o ?? "") || !/^\d{9,12}$/.test(t ?? "") || !/^[0-9a-f]{32}$/.test(sig ?? "")) {
    return { ok: false, reason: "malformed" };
  }
  const good = Buffer.from(sign(tokenId, o, Number(t)));
  const given = Buffer.from(sig);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return { ok: false, reason: "bad_signature", tokenId };
  const age = now - Number(t) * 1000;
  if (age > TTL_MS || age < -SKEW_MS) return { ok: false, reason: "expired", tokenId };

  const owner = `0x${o}` as Address;
  const [current, used] = await Promise.all([
    read<string>(addr.ticket, abis.ticket, "ownerOf", [BigInt(tokenId)]).catch(() => ""),
    read<boolean>(addr.checkIn, abis.checkIn, "used", [BigInt(tokenId)]),
  ]);
  // A ticket that was resold (or is sitting in resale escrow) no longer belongs to whoever generated the code.
  if (current.toLowerCase() !== owner) return { ok: false, reason: "not_owner", tokenId };
  if (used) return { ok: false, reason: "already_used", tokenId };
  return { ok: true, tokenId, owner };
}
