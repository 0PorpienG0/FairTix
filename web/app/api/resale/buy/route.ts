import { NextResponse } from "next/server";
import Stripe from "stripe";
import { config, friendlyError } from "@/lib/chain";
import { buyListing, listingOf, usdcOf } from "@/lib/fulfil";
import { identify } from "@/lib/identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Resale purchase. If the wallet holds enough USDC (e.g. from selling a ticket) it pays on-chain right away;
 * otherwise the buyer pays the price by card and the webhook completes the purchase.
 */
export async function POST(req: Request) {
  try {
    const { wallet, listingId } = (await req.json()) as { wallet?: string; listingId: string | number };
    const w = await identify(wallet);
    if (!w) return NextResponse.json({ ok: false, error: "Please sign in to buy" }, { status: 401 });
    const id = BigInt(listingId);
    const l = await listingOf(id);
    if (!l[3]) return NextResponse.json({ ok: false, error: "Listing is no longer active" }, { status: 400 });
    if (l[0].toLowerCase() === w.address.toLowerCase()) return NextResponse.json({ ok: false, error: "You cannot buy your own listing" }, { status: 400 });
    const price = l[2];

    const key = process.env.STRIPE_SECRET_KEY;
    if (key && (await usdcOf(w.address)) < price) {
      const stripe = new Stripe(key);
      const origin = process.env.APP_URL || new URL(req.url).origin;
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: Number(price / 10000n), product_data: { name: `${config.eventName} - resale ticket #${l[1]}` } } }],
        metadata: { kind: "resale", buyer: w.address, buyerName: w.name, listingId: String(id) },
        success_url: `${origin}/tickets?wallet=${w.name}&paid=resale&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/marketplace?canceled=1`,
      });
      return NextResponse.json({ ok: true, url: session.url });
    }

    // Enough USDC (or no Stripe configured, where the demo tops up the shortfall): pay on-chain now.
    const hashes = await buyListing(w.name, w.address, id, !key);
    return NextResponse.json({ ok: true, txHash: hashes[hashes.length - 1], txHashes: hashes });
  } catch (e) {
    return NextResponse.json({ ok: false, ...friendlyError(e) }, { status: 400 });
  }
}
