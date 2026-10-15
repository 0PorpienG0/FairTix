import { NextResponse } from "next/server";
import Stripe from "stripe";
import { fulfil } from "@/lib/fulfil";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const done = new Set<string>(); // in-memory idempotency (demo)

export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !secret) return NextResponse.json({ error: "Stripe not configured" }, { status: 501 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const stripe = new Stripe(key);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), sig, secret);
  } catch (e) {
    return NextResponse.json({ error: `Bad signature: ${(e as Error).message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    if (done.has(s.id)) return NextResponse.json({ received: true, duplicate: true });
    done.add(s.id);
    const buyer = s.metadata?.buyer;
    if (!buyer) return NextResponse.json({ error: "No buyer in metadata" }, { status: 400 });
    try {
      const { txHash } = await fulfil(buyer);
      return NextResponse.json({ received: true, txHash });
    } catch (e) {
      done.delete(s.id);
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true });
}
