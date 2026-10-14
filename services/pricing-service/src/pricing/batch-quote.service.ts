import { Inject, Injectable } from "@nestjs/common";
import { PRICING_RUNTIME_CONFIG } from "../auth/token.service";
import type { PricingRuntimeConfig } from "../config/environment";
import { ApiException } from "../common/api-exception";
import { PricingService } from "./pricing.service";
import type { BatchQuoteDto } from "./batch-quote.dto";

type Product = { id: string; category: { id: string }; variants: Array<{ id: string; listPrice: number; currency: string }> };

@Injectable()
export class BatchQuoteService {
  constructor(private readonly pricing: PricingService, @Inject(PRICING_RUNTIME_CONFIG) private readonly config: Pick<PricingRuntimeConfig, "catalogServiceUrl">) {}

  async resolve(items: BatchQuoteDto["items"]) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 100) throw new ApiException(400, "BATCH_LIMIT", "Cotiza entre 1 y 100 variantes.");
    if (new Set(items.map(item => item.variantId)).size !== items.length) throw new ApiException(400, "DUPLICATE_VARIANT", "Cada variante debe aparecer una sola vez.");
    let products: Product[];
    try {
      const response = await fetch(this.config.catalogServiceUrl + "/products/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...new Set(items.map(item => item.productId))] }), signal: AbortSignal.timeout(4000) });
      const body: unknown = await response.json();
      if (!response.ok || typeof body !== "object" || body === null || !("products" in body) || !Array.isArray(body.products)) throw new Error("Invalid Catalog response");
      products = body.products as Product[];
    } catch { throw new ApiException(503, "CATALOG_UNAVAILABLE", "No fue posible consultar los precios base del catálogo."); }
    return items.map(item => {
      const product = products.find(product => product.id === item.productId);
      const variant = product?.variants?.find(variant => variant.id === item.variantId);
      if (!product || !variant) throw new ApiException(409, "CATALOG_ITEM_UNAVAILABLE", "Una variante ya no está disponible.");
      if (!Number.isFinite(variant.listPrice) || variant.listPrice < 0 || !/^[A-Z]{3}$/.test(variant.currency) || !product.category?.id) throw new ApiException(503, "CATALOG_UNAVAILABLE", "El catálogo devolvió un precio inválido.");
      return { ...item, categoryId: product.category.id, basePrice: variant.listPrice, currency: variant.currency };
    });
  }

  async quote(body: BatchQuoteDto) {
    const lines = await this.resolve(body.items);
    const result = await this.pricing.quoteMany(lines);
    return { ...result, quotes: result.quotes.map((quote, index) => ({ ...quote, productId: lines[index]!.productId, quantity: lines[index]!.quantity, lineTotal: Math.round(quote.effectivePrice * lines[index]!.quantity * 100) / 100 })) };
  }
}
