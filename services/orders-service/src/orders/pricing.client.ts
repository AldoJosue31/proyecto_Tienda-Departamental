import { Inject, Injectable } from "@nestjs/common";

import { ORDERS_RUNTIME_CONFIG } from "../auth/token.service";
import { ApiException } from "../common/api-exception";
import type { OrdersRuntimeConfig } from "../config/environment";

export interface PriceQuote {
  basePrice: number;
  effectivePrice: number;
  currency: string;
}

@Injectable()
export class PricingClient {
  constructor(
    @Inject(ORDERS_RUNTIME_CONFIG)
    private readonly config: Pick<OrdersRuntimeConfig, "pricingServiceUrl" | "upstreamTimeoutMilliseconds">,
  ) {}

  async quote(input: {
    variantId: string;
    productId: string;
    categoryId: string;
    basePrice: number;
    currency: string;
    correlationId: string | null;
  }): Promise<PriceQuote> {
    const url = new URL("/pricing/quote", this.config.pricingServiceUrl);
    url.searchParams.set("variantId", input.variantId);
    url.searchParams.set("productId", input.productId);
    url.searchParams.set("categoryId", input.categoryId);
    url.searchParams.set("basePrice", String(input.basePrice));
    url.searchParams.set("currency", input.currency);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: input.correlationId ? { "x-correlation-id": input.correlationId } : undefined,
        signal: AbortSignal.timeout(this.config.upstreamTimeoutMilliseconds),
      });
    } catch {
      throw new ApiException(503, "PRICING_UNAVAILABLE", "Precios no está disponible para confirmar el pedido");
    }
    if (!response.ok) {
      throw new ApiException(503, "PRICING_UNAVAILABLE", "Precios no está disponible para confirmar el pedido");
    }
    const value = await response.json().catch(() => null);
    if (
      !this.object(value)
      || typeof value.basePrice !== "number"
      || typeof value.effectivePrice !== "number"
      || typeof value.currency !== "string"
      || !Number.isFinite(value.basePrice)
      || !Number.isFinite(value.effectivePrice)
      || value.basePrice !== input.basePrice
      || value.effectivePrice < 0
      || value.effectivePrice > input.basePrice
      || value.currency !== input.currency
    ) {
      throw new ApiException(503, "PRICING_UNAVAILABLE", "Precios devolvió una respuesta inválida");
    }
    return {
      basePrice: value.basePrice,
      effectivePrice: value.effectivePrice,
      currency: value.currency,
    };
  }

  private object(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
