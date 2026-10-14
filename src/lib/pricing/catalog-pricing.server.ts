import "server-only";
import { gatewayJson } from "@/lib/auth/gateway-client.server";
import type { CatalogProductSummary } from "@/lib/catalog/types";
import type { EffectivePrice, QuoteItem } from "./types";

export async function enrichCatalogPrices(products: CatalogProductSummary[]) {
  const items: QuoteItem[] = products.flatMap(product => product.variants.map(variant => ({ productId: product.id, variantId: variant.id, quantity: 1 })));
  if (!items.length) return { items: products, pricingValidUntil: new Date(Date.now() + 30_000).toISOString() };
  try {
    const prices = new Map<string, EffectivePrice>(); let pricingValidUntil = new Date(Date.now() + 30_000).toISOString();
    // Bounded page batches: one Pricing request and one Catalog batch, not per card.
    for (let offset = 0; offset < items.length; offset += 100) {
      const result = await gatewayJson<{ quotes: EffectivePrice[]; validUntil: string }>("/pricing/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: items.slice(offset, offset + 100) }), signal: AbortSignal.timeout(7000) });
      if (!result.response.ok || !Array.isArray(result.body?.quotes) || typeof result.body.validUntil !== "string") throw new Error("Pricing unavailable");
      for (const quote of result.body.quotes) prices.set(quote.variantId, quote);
      pricingValidUntil = result.body.validUntil < pricingValidUntil ? result.body.validUntil : pricingValidUntil;
    }
    if (items.some(item => !prices.has(item.variantId))) throw new Error("Incomplete pricing");
    return { items: products.map(product => ({ ...product, variants: product.variants.map(variant => ({ ...variant, price: prices.get(variant.id) })) })), pricingValidUntil };
  } catch {
    // Browsing continues; never pass an old effective price off as current.
    return { items: products.map(product => ({ ...product, variants: product.variants.map(variant => { const pending = { ...variant }; delete pending.price; return pending; }) })), pricingValidUntil: new Date(Date.now() + 5000).toISOString() };
  }
}
