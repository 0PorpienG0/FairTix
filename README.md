# FairTix — on-chain ticketing demo (hackathon MVP)

Instant organizer payout at sale + open-price resale with automatic artist royalty and platform fee.
Local chain by default (no accounts needed). Demo wallets (Alice, Bob) sign server-side, so no MetaMask.

## Run the demo (3 terminals, from repo root)
```
# 1. local chain
cd contracts && npm install && npx hardhat node

# 2. deploy (new terminal) — also mints demo USDC and writes shared/deployment.json
cd contracts && npx hardhat run scripts/deploy.ts --network localhost

# 3. web
cd web && npm install && cp .env.example .env.local && npm run build && npm start
# open http://localhost:3000
```
Restart the chain + redeploy to reset the demo to a clean state.

## Checks
- `cd contracts && npx hardhat test` — 11 contract tests
- `node scripts/e2e.mjs` — full demo flow against a running chain + web 

## Pitch demo flow
1. `/` as Alice: Buy ticket ($50 + $2.50 fee = $52.50).
2. `/organizer` (open in another tab): +$48.50 appears instantly (platform +$1.50).
3. `/tickets` as Alice: list at $120 -> accepted (no cap). The live preview shows artist 10% = $12, platform 5% = $6, seller $102.
4. Switch to Bob: buy Alice's listing.
5. `/organizer`: artist +$12, platform +$6; Alice received $102; ticket now Bob's.

## Config
All money values live in `shared/config.json` (face value, buyer fee, organizer/platform split, `royaltyBps`, `resaleFeeBps`, `resaleCapBps`). Change and redeploy.
Resale uses percentages: `royaltyBps` 1000 = 10% to the artist, `resaleFeeBps` 500 = 5% to the platform, seller keeps the rest (85%).
`resaleCapBps` 0 = no price cap (the contract can still enforce one if set > 0). Primary split: organizer $48.50 + platform $1.50 = $50 face value.

### Why these fees
- Percentages scale with price: a $120 resale pays the artist $12, a $60 one only $6, so the artist shares in secondary-market upside instead of a fixed pittance.
- No cap: the market sets the price; the royalty and fee capture value from high-priced resales rather than banning them.
- Platform earns on both sides: $1.50 per primary sale (3% of face) and 5% of every resale, aligning revenue with volume.
- Organizer still receives $48.50 instantly at sale, with no waiting for settlement, and the seller always gets the remainder (integer division, as in the contract).

## Stripe test mode (optional)
Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in `web/.env.local`, then
`stripe listen --forward-to localhost:3000/api/stripe/webhook`. Without keys the buy button runs in "Demo mode".
The Stripe -> USDC conversion is mocked: a server-side treasury wallet pays the contract.

## Public testnet (Base Sepolia, optional)
Set `PRIVATE_KEY`, `BASE_SEPOLIA_RPC` (and optionally `USDC_ADDRESS`) for `contracts/`, fund the deployer with faucet ETH,
run `npx hardhat run scripts/deploy.ts --network baseSepolia`, set `NEXT_PUBLIC_EXPLORER_URL=https://sepolia.basescan.org`.
Not yet run end to end.

## Roadmap (out of scope)
KYC, chargeback/cancellation handling (holdback or organizer deposit), rotating QR codes, mobile app, Thai regulatory review, real THB->USDC on-ramp.
