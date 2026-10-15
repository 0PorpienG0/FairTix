import { NextResponse } from "next/server";
import Stripe from "stripe";
import { fulfil } from "@/lib/fulfil";
import { config, friendlyError, resolveWallet } from "@/lib/chain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { buyer } = (await req.json()) as { buyer?: string };
    const w = buyer ? resolveWallet(buyer) : null;
    if (!w) return NextResponse.json({ ok: false, error: "Unknown buyer wallet" }, { status: 400 });

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      const { txHash } = await fulfil(w.address);
      return NextResponse.json({ ok: true, demo: true, txHash });
    }

    const stripe = new Stripe(key);
    const origin = process.env.APP_URL || new URL(req.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        { quantity: 1, price_data: { currency: "usd", unit_amount: Number(BigInt(config.faceValue) / 10000n), product_data: { name: `${config.eventName} - General Admission` } } },
        { quantity: 1, price_data: { currency: "usd", unit_amount: Number(BigInt(config.buyerFee) / 10000n), product_data: { name: "Service fee" } } },
      ],
      metadata: { buyer: w.address, buyerName: w.name },
      success_url: `${origin}/tickets?wallet=${w.name}&paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=1`,
    });
    return NextResponse.json({ ok: true, url: session.url });
  } catch (e) {
    return NextResponse.json({ ok: false, ...friendlyError(e) }, { status: 500 });
  }
}
