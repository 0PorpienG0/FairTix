# FairTix

**Fair, on-chain ticketing.** Buy with a card, resell safely, and let the artist earn on every resale.
No crypto knowledge needed: fans sign in with Google and pay like any online shop, while tickets live on a public blockchain.

**Live demo:** https://fairtix-demo.vercel.app (Avalanche Fuji testnet + Stripe test mode, no real money moves)

## The problem

| Problem today | What FairTix does |
|---|---|
| Fake and duplicated tickets | Every ticket is a unique NFT on a public chain; entry is checked against on-chain ownership |
| Scalpers and untraceable resale | Tickets cannot be transferred freely. They can only change hands through the official market |
| Artists earn nothing from resale | A flat **15% transaction fee** is taken on every resale automatically (on-chain it is split 10% artist royalty / 5% platform) |
| Organizers wait days for payout | Organizer receives **$48.50 of a $50 ticket at the moment of sale** |
| Screenshot / shared-QR entry fraud | Entry QR re-signs every 15 s and expires 30 s after it is made; a ticket can be admitted only once |

## Features

- **Card checkout** (Stripe Checkout, test mode). A webhook mints the ticket to the buyer's wallet. Idempotent: replayed webhooks never mint twice.
- **Google sign-in** (Clerk). Each user gets a wallet derived on the server, so there is nothing to install or remember.
- **Primary sale contract** splits revenue on-chain: organizer $48.50 + platform $1.50 per $50 ticket, plus a $2.50 service fee paid by the buyer.
- **Resale marketplace** with escrow. Seller lists, buyer pays, the contract takes a 15% transaction fee (split on-chain: 10% artist / 5% platform) and pays the seller 85% and moves the ticket atomically.
- **Pay for a resale with USDC or by card.** Money from selling a ticket lands in the user's USDC balance and can pay for the next ticket. Not enough? Checkout falls back to a card payment.
- **Rotating entry QR + gate scanner.** `/scan` (PIN-protected) verifies the code against live ownership and records the entry on-chain through a `CheckIn` contract.
- **Organizer dashboard** with live revenue, artist royalty and platform fees read from the chain.

## How the money moves

```
Primary sale   card ($52.50) ──Stripe──▶ webhook ──▶ treasury pays 50 USDC ──▶ PrimarySale
                                                                 ├─ $48.50 organizer   (instant)
                                                                 ├─ $1.50  platform
                                                                 └─ NFT minted to the buyer

Resale         seller lists (NFT held in escrow) ──▶ buyer pays USDC (or card)
                                                                 ├─ 85% seller
                                                                 ├─ 15% transaction fee
                                                                 │     (on-chain: 10% artist royalty + 5% platform)
                                                                 └─ NFT moves to the buyer
```

All percentages and amounts live in [`shared/config.json`](shared/config.json). `resaleCapBps = 0` means no price cap; set it above 0 and the contract enforces it.

## Architecture

```
contracts/   Hardhat + OpenZeppelin 5
  MockUSDC       test stablecoin (6 decimals) with a public mint
  TicketNFT      ERC-721, transfers locked except through the marketplace
  PrimarySale    treasury-funded sale with the organizer/platform split
  Marketplace    escrowed resale with royalty and platform fee
  CheckIn        on-chain "ticket used" register (only the gate wallet can admit, once)
web/         Next.js 14 (App Router) + Tailwind + viem
  app/api/*      checkout, Stripe webhook, resale list/buy/cancel, state, entry QR, gate verify
  lib/chain.ts   RPC clients, wallet derivation, event-log scanner
  lib/qr.ts      signed, expiring entry codes
shared/      config, deployment addresses and ABIs used by both sides
scripts/     end-to-end flow against a running chain + web app
```

**Wallets.** Signed-in users get a private key derived as `HMAC-SHA256(WALLET_MASTER_SECRET, userId)`. Nothing is stored, the same account always maps to the same wallet, and the server signs on the user's behalf after checking the session. This is a *custodial* design, fine for a demo. See [Limitations](#limitations).

**No database.** The chain is the database: ownership, sales, listings and check-ins are read from contracts and events. Stripe holds the payment-idempotency record (on the PaymentIntent metadata).

### Deployed contracts (Avalanche Fuji, chain id 43113)

| Contract | Address |
|---|---|
| MockUSDC | `0x9d77E1d099fcde6B9d9A54EdE742a62953e7a23d` |
| TicketNFT | `0x53874ddFfc571B8aa44512bB670955699c46431b` |
| PrimarySale | `0x7d2edA461141587e0c9e1cAD9aDEEa7299f3cE2f` |
| Marketplace | `0x816A8859b163EEE4ACa7c657A025D20bDAe884B0` |
| CheckIn | `0x92A241B8c3424728Dc1cf667cE74dC6ae96Fb462` |

Browse them on the [Avalanche Fuji explorer](https://explorer-test.avax.network/c-chain). The previous Base Sepolia deployment is kept in [`shared/deployment.base-sepolia.json`](shared/deployment.base-sepolia.json).

## Try it

1. Open the live demo and sign in with Google.
2. **Buy a ticket.** On the Stripe page use the test card `4242 4242 4242 4242`, any future date, any CVC. The ticket appears under *My tickets* a few seconds later.
3. Open the **Organizer** page in another tab: the revenue split shows up instantly.
4. **Resell** your ticket from *My tickets*. The preview shows the 15% transaction fee and what the seller receives.
5. With a second account, **buy it** on the *Resale market*. Pay with USDC if you have it, otherwise by card.
6. **Entry:** *My tickets → Show entry QR*, then scan it on `/scan` with the demo gate PIN `123456` (demo only; a scanned ticket cannot be reused, so buy a spare ticket to try it).

## Run locally

Requires Node 22. With no keys set, the app runs in **demo mode**: a local chain, built-in demo wallets (Alice and Bob) and a simulated payment.

```bash
# 1. local chain
cd contracts && npm install && npx hardhat node

# 2. deploy (new terminal): mints demo USDC and writes shared/deployment.json
cd contracts && npx hardhat run scripts/deploy.ts --network localhost
npx hardhat run scripts/deploy-checkin.ts --network localhost

# 3. web
cd web && npm install && cp .env.example .env.local && npm run dev
# open http://localhost:3000
```

Restart the chain and redeploy for a clean state.

**Checks:** `cd contracts && npx hardhat test` (16 contract tests) and `node scripts/e2e.mjs` (full flow against a running chain and web app).

### Environment variables (`web/.env.local`, see `.env.example`)

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe test mode. Empty = demo mode |
| `APP_URL` | Public base URL for Stripe redirects |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Google sign-in. Empty = Alice/Bob switcher |
| `WALLET_MASTER_SECRET` | Derives every user wallet (and signs entry QR codes). **Never change or leak it** |
| `GATE_PIN` | PIN for the `/scan` page |
| `RPC_URL`, `LOGS_RPC_URL` | Optional private RPC for reads / log queries |
| `TESTNET_KEYS_JSON` | Server wallets for a testnet deployment (hosting) |
| `USER_GAS_ETH` | Testnet ETH sent to each new user wallet for gas |

Never commit `.env*` or `shared/testnet-keys.json` (both are git-ignored). `shared/demo-keys.json` holds the public Hardhat keys for the local chain only.

### Testnet deployment

```bash
cd contracts
npx hardhat run scripts/deploy.ts --network avalancheFuji        # needs PRIVATE_KEY + faucet AVAX (or --network baseSepolia)
npx hardhat run scripts/deploy-checkin.ts --network avalancheFuji  # run after deploy.ts
```

`deploy.ts` generates throwaway wallets into `shared/testnet-keys.json` (git-ignored) and funds them from the deployer.

## Limitations

This is a hackathon MVP. Be honest about what is simulated:

- **Stripe → USDC is mocked.** A server-side treasury wallet pays the contract; card money is not actually converted. A real system needs an on-ramp or a stablecoin settlement partner.
- **Custodial wallets.** The server holds every user's key (derived from one master secret). A leaked `WALLET_MASTER_SECRET` exposes all wallets. Production needs a KMS/HSM or embedded-wallet provider, and a way for users to withdraw tickets to their own wallet.
- **Testnet only.** USDC and ETH have no value. Clerk runs on development keys.
- **Gate PIN is a shared secret.** Production should use per-staff accounts and rate limiting.
- Display data (event date, venue) is placeholder content in `web/lib/event.ts`.

## Roadmap

Withdraw tickets to MetaMask, passkeys and phone verification against account sharing, resale price cap, email receipts, a small database for faster history, KYC and chargeback handling, a real fiat-to-USDC on-ramp.
