// End-to-end demo check. Needs: hardhat node + deploy done, web running on BASE (default :3000).
const BASE = process.env.BASE || "http://localhost:3000";
const post = async (p, b) => { const r = await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, ...(await r.json()) }; };
const state = async (w) => (await fetch(`${BASE}/api/state?wallet=${w}`)).json();
let fails = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`); if (!ok) fails++; };
const usd = (x) => Number(BigInt(x)) / 1e6;

const s0 = await state("alice");
const buy = await post("/api/checkout", { buyer: "alice" });
check("1. Alice buys ticket (demo checkout)", buy.ok && buy.txHash, buy.error || "");
const s1 = await state("alice");
check("2. Organizer got +$49 instantly", usd(s1.balances.organizer) - usd(s0.balances.organizer) === 49, `(${usd(s0.balances.organizer)} -> ${usd(s1.balances.organizer)})`);
check("   Platform got +$1", usd(s1.balances.platform) - usd(s0.balances.platform) === 1);
const tokenId = s1.tickets.at(-1)?.tokenId;
check("   Alice owns the ticket", tokenId !== undefined, `token ${tokenId}`);

const over = await post("/api/resale/list", { wallet: "alice", tokenId, price: "61000000" });
check("3. Listing at $61 (cap $60) rejected", !over.ok, over.error || "");
const ok = await post("/api/resale/list", { wallet: "alice", tokenId, price: "60000000" });
check("4. Listing at $60 accepted", ok.ok, ok.error || "");

const sb = await state("bob");
const listing = sb.listings.find((l) => l.tokenId === tokenId);
check("   Bob sees the listing", !!listing);
const a0 = usd((await state("alice")).wallet.usdc);
const sBefore = sb.balances;
const bb = await post("/api/resale/buy", { wallet: "bob", listingId: listing.id });
check("5. Bob buys listing", bb.ok, bb.error || "");
const sa = await state("alice"), sbb = await state("bob");
check("   Ticket moved to Bob", sbb.tickets.some((t) => t.tokenId === tokenId) && !sa.tickets.some((t) => t.tokenId === tokenId));
check("   Alice received $58", usd(sa.wallet.usdc) - a0 === 58);
check("   Artist +$1 royalty", usd(sa.balances.artist) - usd(sBefore.artist) === 1);
check("   Platform +$1 fee", usd(sa.balances.platform) - usd(sBefore.platform) === 1);
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
