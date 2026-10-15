/** Display-only event details for the demo (not stored on-chain). */
export const EVENT = {
  date: "Sat 12 Dec 2026",
  doors: "Doors 18:00 · Show 19:30",
  venue: "Impact Arena, Bangkok",
  category: "Live concert",
  tier: "General Admission",
  network: process.env.NEXT_PUBLIC_EXPLORER_URL ? "Base Sepolia testnet" : "Local test chain",
};
