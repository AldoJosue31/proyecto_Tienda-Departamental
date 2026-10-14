export type QuoteItem = { productId: string; variantId: string; quantity: number };
export type EffectivePrice = {
  variantId: string; basePrice: number; effectivePrice: number; currency: string;
  discountAmount: number; discountPercentage: number;
  appliedPromotion: { id: string; name: string; priority: number } | null; quotedAt: string;
};
export type CartQuote = {
  prices: Array<EffectivePrice & QuoteItem & { lineTotal: number }>;
  subtotal: number; total: number; discountTotal: number; currency: string;
  quotedAt: string; validUntil: string;
};
export function priceRefreshDelay(validUntil?: string): number {
  const remaining = validUntil ? Date.parse(validUntil) - Date.now() : 30_000;
  return Math.max(250, Math.min(30_000, Number.isFinite(remaining) ? remaining : 30_000));
}
