# FairTix — on-chain ticketing demo (hackathon MVP)

Instant organizer payout at sale + safe capped resale with automatic artist royalty.
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
- `node scripts/e2e.mjs` — full demo flow against a running chain + web (12 checks)

## Pitch demo flow
1. `/` as Alice: Buy ticket ($50 + $2.50 fee = $52.50).
2. `/organizer` (open in another tab): +$49 appears instantly, platform +$1.
3. `/tickets` as Alice: list at $61 -> rejected (cap $60). List at $60 -> OK.
4. Switch to Bob: buy Alice's listing.
5. `/organizer`: artist +$1, platform +$1; Alice received $58; ticket now Bob's.

## Config
All money values live in `shared/config.json` (face value, fees, resale cap bps, royalty, platform fee). Change and redeploy.

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
