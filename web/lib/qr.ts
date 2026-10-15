import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Address } from "viem";
import { abis, addr, read } from "./chain";

/** The entry QR rotates every WINDOW_MS; the gate accepts the current and the previous window. */
export const WINDOW_MS = 30_000;
const PREFIX = "FT1";

function key() {
  const base = process.env.QR_SECRET || process.env.WALLET_MASTER_SECRET;
  if (!base) throw new Error("QR_SECRET (or WALLET_MASTER_SECRET) is not set");
  return createHmac("sha256", base).update("fairtix-entry-qr-v1").digest();
}
const sign = (tokenId: string, owner: string, win: number) =>
  createHmac("sha256", key()).update(`${tokenId}.${owner}.${win}`).digest("hex").slice(0, 32);

const windowOf = (ms: number) => Math.floor(ms / WINDOW_MS);

/** Code = FT1.<tokenId>.<owner>.<window>.<signature>: proves the ticket's owner asked for it within the last minute. */
export function issueCode(tokenId: string, owner: Address, now = Date.now()) {
  const o = owner.toLowerCase().slice(2);
  const win = windowOf(now);
  return { code: `${PREFIX}.${tokenId}.${o}.${win}.${sign(tokenId, o, win)}`, expiresAt: (win + 1) * WINDOW_MS };
}

export type Check =
  | { ok: true; tokenId: string; owner: Address }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "not_owner" | "already_used"; tokenId?: string };

export async function checkCode(raw: string, now = Date.now()): Promise<Check> {
  const [p, tokenId, o, w, sig] = raw.trim().split(".");
  if (p !== PREFIX || !/^\d+$/.test(tokenId ?? "") || !/^[0-9a-f]{40}$/.test(o ?? "") || !/^\d+$/.test(w ?? "") || !/^[0-9a-f]{32}$/.test(sig ?? "")) {
    return { ok: false, reason: "malformed" };
  }
  const good = Buffer.from(sign(tokenId, o, Number(w)));
  const given = Buffer.from(sig);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return { ok: false, reason: "bad_signature", tokenId };
  if (windowOf(now) - Number(w) > 1 || Number(w) > windowOf(now)) return { ok: false, reason: "expired", tokenId };

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
