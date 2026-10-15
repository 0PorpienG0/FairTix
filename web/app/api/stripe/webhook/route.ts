import { NextResponse } from "next/server";
import Stripe from "stripe";
import { fulfil } from "@/lib/fulfil";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const done = new Set<string>(); // fast path; the durable record lives in Stripe (PaymentIntent metadata)
const CLAIM_TTL_MS = 2 * 60 * 1000;

/** Durable idempotency across serverless instances: record the claim/result on the PaymentIntent. */
async function alreadyHandled(stripe: Stripe, piId: string | null): Promise<boolean> {
  if (!piId) return false;
  const m = (await stripe.paymentIntents.retrieve(piId)).metadata;
  if (m.fulfilled_tx) return true;
  return !!m.fulfil_claim && Date.now() - Number(m.fulfil_claim) < CLAIM_TTL_MS;
}

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
    const buyer = s.metadata?.buyer;
    if (!buyer) return NextResponse.json({ error: "No buyer in metadata" }, { status: 400 });
    const piId = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
    done.add(s.id);
    try {
      if (await alreadyHandled(stripe, piId)) return NextResponse.json({ received: true, duplicate: true });
      if (piId) await stripe.paymentIntents.update(piId, { metadata: { fulfil_claim: String(Date.now()) } });
      const { txHash } = await fulfil(buyer);
      if (piId) await stripe.paymentIntents.update(piId, { metadata: { fulfilled_tx: txHash, fulfil_claim: "" } });
      return NextResponse.json({ received: true, txHash });
    } catch (e) {
      done.delete(s.id);
      if (piId) await stripe.paymentIntents.update(piId, { metadata: { fulfil_claim: "" } }).catch(() => {});
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true });
}
