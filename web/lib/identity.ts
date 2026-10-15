import "server-only";
import { auth } from "@clerk/nextjs/server";
import { parseEther, type Address } from "viem";
import { publicClient, resolveWallet, userWallet, walletFor } from "./chain";

export const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export interface Identity { name: string; address: Address }

/**
 * Who is calling? With Clerk configured it is the signed-in user (the client-supplied wallet is ignored);
 * without it, the demo wallets alice/bob chosen in the header.
 */
export async function identify(demoWallet?: string | null): Promise<Identity | null> {
  if (clerkEnabled) {
    const { userId } = await auth();
    return userId ? userWallet(userId) : null;
  }
  const w = demoWallet ? resolveWallet(demoWallet) : null;
  return w ? { name: w.name, address: w.address } : null;
}

const GAS_DRIP = parseEther(process.env.USER_GAS_ETH || "0.00001");
const funded = new Set<string>();
let queue: Promise<unknown> = Promise.resolve();

/** New user wallets hold no ETH: have the treasury send a small gas drip once (serialised to avoid nonce clashes). */
export async function ensureGas(address: Address): Promise<void> {
  const key = address.toLowerCase();
  if (funded.has(key)) return;
  const run = queue.then(async () => {
    if ((await publicClient.getBalance({ address })) >= GAS_DRIP / 2n) return void funded.add(key);
    const hash = await walletFor("treasury").sendTransaction({ to: address, value: GAS_DRIP });
    await publicClient.waitForTransactionReceipt({ hash });
    funded.add(key);
  });
  queue = run.catch(() => {});
  await run;
}
