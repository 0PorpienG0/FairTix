// End-to-end demo check. Needs: hardhat node + deploy done, web running on BASE (default :3000).
const BASE = process.env.BASE || "http://localhost:3000";
const post = async (p, b) => { const r = await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, ...(await r.json()) }; };
const state = async (w) => {
  for (let i = 0; ; i++) {
    const j = await (await fetch(`${BASE}/api/state?wallet=${w}`)).json();
    if (j.balances || i >= 5) return j; // retry transient RPC errors
    await new Promise((r) => setTimeout(r, 1000));
  }
};
let fails = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`); if (!ok) fails++; };
const usd = (x) => Number(BigInt(x)) / 1e6;

const s0 = await state("alice");
const buy = await post("/api/checkout", { buyer: "alice" });
const stripeMode = !!buy.url; // Stripe keys configured: a real card checkout cannot be completed by a script
if (stripeMode) console.log("NOTE  Stripe test mode is on: checkout session created, skipping primary-sale payout checks and reusing Alice's latest ticket");
check("1. Alice buys ticket (demo checkout)", buy.ok && (buy.txHash || stripeMode), buy.error || "");
// public-testnet RPCs can lag: poll until the new sale shows up
let s1 = await state("alice");
for (let i = 0; i < 30 && !stripeMode && s1.sold === s0.sold; i++) { await new Promise((r) => setTimeout(r, 1000)); s1 = await state("alice"); }
if (!stripeMode) check("2. Organizer got +$48.50 instantly", usd(s1.balances.organizer) - usd(s0.balances.organizer) === 48.5, `(${usd(s0.balances.organizer)} -> ${usd(s1.balances.organizer)})`);
if (!stripeMode) check("   Platform got +$1.50", usd(s1.balances.platform) - usd(s0.balances.platform) === 1.5);
const tokenId = s1.tickets.at(-1)?.tokenId;
check("   Alice owns the ticket", tokenId !== undefined, `token ${tokenId}`);

const ok = await post("/api/resale/list", { wallet: "alice", tokenId, price: "120000000" });
check("3. Listing at $120 (no cap) accepted", ok.ok, ok.error || "");

let sb = await state("bob");
let listing = sb.listings.find((l) => l.tokenId === tokenId);
for (let i = 0; i < 30 && !listing; i++) { await new Promise((r) => setTimeout(r, 1000)); sb = await state("bob"); listing = sb.listings.find((l) => l.tokenId === tokenId); }
check("   Bob sees the listing", !!listing);
const a0 = usd((await state("alice")).wallet.usdc);
const sBefore = sb.balances;
const bb = await post("/api/resale/buy", { wallet: "bob", listingId: listing.id });
check("4. Bob buys listing", bb.ok, bb.error || "");
let sa = await state("alice"), sbb = await state("bob");
for (let i = 0; i < 30 && (!sbb.tickets.some((t) => t.tokenId === tokenId) || usd(sa.balances.artist) === usd(sBefore.artist) || usd(sa.wallet.usdc) === a0); i++) { await new Promise((r) => setTimeout(r, 1000)); sa = await state("alice"); sbb = await state("bob"); }
check("   Ticket moved to Bob", sbb.tickets.some((t) => t.tokenId === tokenId) && !sa.tickets.some((t) => t.tokenId === tokenId));
check("   Alice received $102", usd(sa.wallet.usdc) - a0 === 102);
check("   Artist +$12 royalty (10%)", usd(sa.balances.artist) - usd(sBefore.artist) === 12);
check("   Platform +$6 fee (5%)", usd(sa.balances.platform) - usd(sBefore.platform) === 6);
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
