export type WalletName = "alice" | "bob";

export interface Listing { id: string; seller: string; sellerName: string | null; tokenId: string; price: string; active: boolean }
export interface SaleEvent { buyer: string; buyerName: string | null; tokenId: string; organizerAmount: string; platformAmount: string; txHash: string; block: string }
export interface ResaleEvent { listingId: string; buyer: string; tokenId: string; price: string; royalty: string; fee: string; sellerProceeds: string; txHash: string; block: string }

export interface StateResponse {
  wallet: { name: string; address: string; usdc: string } | null;
  tickets: { tokenId: string }[];
  listings: Listing[];
  myListings: Listing[];
  balances: { organizer: string; platform: string; artist: string };
  sales: SaleEvent[];
  resales: ResaleEvent[];
  sold: string;
  maxSupply: number;
  maxPrice: string;
  stripeEnabled: boolean;
  block: string;
}

export interface MarketResale extends ResaleEvent { buyerName: string | null }
export interface MarketplaceResponse {
  listings: Listing[];
  resales: MarketResale[];
  stats: { activeCount: number; cap: string; /* "0" = no cap */ floor: string | null; totalResales: number; totalVolume: string };
  faceValue: string;
  eventName: string;
  royaltyBps: number;
  feeBps: number;
  capBps: number;
  block: string;
}

export interface ApiResult { ok: boolean; txHash?: string; txHashes?: string[]; url?: string; error?: string; errorName?: string; demo?: boolean; tokenId?: string }
