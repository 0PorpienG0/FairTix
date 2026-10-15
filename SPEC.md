# SPEC — On-chain ticketing MVP (shared contract between agents)

Monorepo layout (npm workspaces NOT used; two independent packages):
- `contracts/`  Hardhat 2 + TypeScript + OpenZeppelin 5. Owner: contracts agent.
- `web/`        Next.js (App Router, TS, Tailwind) + viem. Owner: web agent + payments agent (api routes under `web/app/api`).
- `shared/config.json`  Single source of truth for money values (units: USDC 6 decimals, stored as integer micro-USDC strings).

## Config (shared/config.json)
```json
{
  "faceValue": "50000000",
  "buyerFee": "2500000",
  "organizerShare": "49000000",
  "platformShare": "1000000",
  "resaleCapBps": 12000,
  "royaltyFlat": "1000000",
  "resaleFeeFlat": "1000000",
  "eventName": "Demo Concert 2026",
  "maxSupply": 100
}
```
Primary: buyer pays faceValue+buyerFee ($52.50) via Stripe (fiat). Stripe keeps the $2.50 fee; the remaining **$50.00** becomes USDC and reaches the contract; it splits $49 organizer / $1 platform. Config invariant: organizerShare + platformShare == faceValue.

## Contracts (contracts/contracts/)
All amounts in USDC 6-decimals. USDC = ERC20 (MockUSDC on local/testnet if real one unavailable; address from env).

### MockUSDC.sol
ERC20, 6 decimals, public `mint(address,uint256)` (testnet only).

### TicketNFT.sol (ERC-721, OZ 5)
- `constructor(string name, string symbol, address admin)`
- `mint(address to) returns (uint256 tokenId)` — only `MINTER_ROLE` (PrimarySale).
- `setMarketplace(address)` — admin only; the ONLY address allowed to move tokens.
- Transfer lock: override `_update` so any transfer where `from != 0 && to != 0` reverts unless `msg.sender == marketplace`. Approvals by owners to marketplace are done via `approve`/`setApprovalForAll` as normal (marketplace is the operator). Burning disabled.
- `faceValue()` view not needed; cap is enforced in marketplace.

### PrimarySale.sol
- `constructor(IERC20 usdc, TicketNFT ticket, address organizer, address platform, uint256 faceValue, uint256 organizerShare, uint256 platformShare, uint256 maxSupply, address treasury)`
- `buyFor(address buyer) returns (uint256 tokenId)` — callable ONLY by `treasury` (the server wallet standing in for the Stripe→USDC conversion). Pulls `faceValue` USDC from treasury via transferFrom (treasury must approve), sends `organizerShare` to organizer and `platformShare` to platform in the same tx, mints ticket to `buyer`. Reverts if sold out.
- Event: `TicketSold(address indexed buyer, uint256 indexed tokenId, uint256 organizerAmount, uint256 platformAmount)`.
- `sold()` view.

### Marketplace.sol (escrow)
- `constructor(IERC20 usdc, TicketNFT ticket, address artist, address platform, uint256 faceValue, uint256 capBps, uint256 royaltyFlat, uint256 feeFlat)`
- `list(uint256 tokenId, uint256 price)` — caller must own token and have approved marketplace. Reverts `PriceAboveCap` if `price > faceValue*capBps/10000`. Reverts if `price < royaltyFlat + feeFlat`. Escrows the NFT (transfers to marketplace). Emits `Listed(listingId, seller, tokenId, price)`.
- `cancel(uint256 listingId)` — seller only; returns NFT. Emits `Cancelled`.
- `buy(uint256 listingId)` — buyer must approve USDC beforehand. In ONE tx: pull `price` USDC from buyer, pay `royaltyFlat` to artist, `feeFlat` to platform, `price-royalty-fee` to seller, transfer NFT to buyer. Any failure reverts everything (atomic = refund-on-failure). Emits `Sold(listingId, buyer, tokenId, price, royalty, fee, sellerProceeds)`.
- `listings(uint256)` view returning (seller, tokenId, price, active). `nextListingId()` view. `maxPrice()` view = cap.
- Use ReentrancyGuard + SafeERC20.

### Deploy script: `contracts/scripts/deploy.ts`
Deploys everything, wires roles, funds demo wallets (local only), writes `shared/deployment.json`:
```json
{ "chainId": 31337, "rpcUrl": "http://127.0.0.1:8545",
  "usdc": "0x..", "ticket": "0x..", "primarySale": "0x..", "marketplace": "0x..",
  "accounts": { "organizer": "0x..", "platform": "0x..", "artist": "0x..", "treasury": "0x..", "alice": "0x..", "bob": "0x.." } }
```
Also writes `shared/abi/{MockUSDC,TicketNFT,PrimarySale,Marketplace}.json` (ABI arrays only) after compile.
Local demo private keys: Hardhat default accounts (documented in `shared/demo-keys.json`: name → {address, privateKey}), index order: deployer0, organizer1, platform2, artist3, treasury4, alice5, bob6. LOCAL ONLY.

## Web (web/)
Pages (App Router):
1. `/` Buy ticket — event card, price breakdown ($50 + $2.50 fee = $52.50), "Pay with card" → POST `/api/checkout` (Stripe Checkout test mode if `STRIPE_SECRET_KEY` set; else demo stub that immediately calls the fulfil path). Buyer chosen from demo wallet selector (Alice/Bob) — no MetaMask needed.
2. `/tickets` My tickets — wallet selector; lists owned tickets (+ active listings); "List for resale" form with price input. Rejected-above-cap shows the contract revert (`PriceAboveCap`) clearly; valid price succeeds. Also shows other users' listings with "Buy" button (Bob buys Alice's).
3. `/organizer` Organizer dashboard — organizer USDC balance (polling 2s), recent `TicketSold` events with amounts, platform balance, artist royalty balance, links to block explorer (`NEXT_PUBLIC_EXPLORER_URL`, tx hash links; none on local).

Server-side signing: API routes use `shared/demo-keys.json` / env keys via viem walletClient so no browser wallet. Route list:
- `POST /api/checkout` {buyer} → creates Stripe session or stub; returns {url|txHash}
- `POST /api/stripe/webhook` → on `checkout.session.completed` calls fulfil
- `lib/fulfil.ts` → treasury calls `primarySale.buyFor(buyer)` (after ensuring USDC allowance)
- `POST /api/resale/list` {wallet, tokenId, price}, `POST /api/resale/cancel`, `POST /api/resale/buy` {wallet, listingId} — sign as the selected demo wallet.
- `GET /api/state?wallet=` → tickets, listings, balances, sale events.
Chain reads via viem `publicClient` from `shared/deployment.json`.

## Definition of done (checked by QA)
1. `cd contracts && npx hardhat test` passes (covers: split 49/1, cap reject, transfer lock, atomic resale split, cancel refund, sold out).
2. `npx hardhat node` + `npx hardhat run scripts/deploy.ts --network localhost` succeeds and writes shared/deployment.json.
3. `cd web && npm run build` passes; pages load.
4. `scripts/e2e.ts` (run against local node + `next start`): buy as Alice → organizer balance +49 → Alice list at 61 (cap 60) rejected → list at 60 OK → Bob buys → NFT owner Bob; artist +1, platform +1(+1 earlier), Alice gets 58.
