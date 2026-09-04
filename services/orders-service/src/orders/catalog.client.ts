import { Inject, Injectable } from "@nestjs/common";

import { ORDERS_RUNTIME_CONFIG } from "../auth/token.service";
import { ApiException } from "../common/api-exception";
import type { OrdersRuntimeConfig } from "../config/environment";

interface CatalogVariant {
  id: string;
  sku: string;
  label: string;
  listPrice: number;
  currency: string;
}

export interface CatalogSnapshot {
  productId: string;
  categoryId: string;
  productName: string;
  variantId: string;
  sku: string;
  variantLabel: string;
  listPrice: number;
  currency: string;
}

@Injectable()
export class CatalogClient {
  constructor(
    @Inject(ORDERS_RUNTIME_CONFIG)
    private readonly config: Pick<OrdersRuntimeConfig, "catalogServiceUrl" | "upstreamTimeoutMilliseconds">,
  ) {}

  async getVariant(productId: string, variantId: string, correlationId: string | null): Promise<CatalogSnapshot> {
    const url = new URL("/products/" + encodeURIComponent(productId), this.config.catalogServiceUrl);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: correlationId ? { "x-correlation-id": correlationId } : undefined,
        signal: AbortSignal.timeout(this.config.upstreamTimeoutMilliseconds),
      });
    } catch {
      throw new ApiException(503, "CATALOG_UNAVAILABLE", "Catálogo no está disponible para confirmar el pedido");
    }
    if (response.status === 404) {
      throw new ApiException(409, "CATALOG_ITEM_UNAVAILABLE", "El producto o la variante ya no está disponible");
    }
    if (!response.ok) {
      throw new ApiException(503, "CATALOG_UNAVAILABLE", "Catálogo no está disponible para confirmar el pedido");
    }
    const payload = await response.json().catch(() => null);
    const product = this.product(payload);
    const variant = product.variants.find((candidate) => candidate.id === variantId);
    if (!variant) {
      throw new ApiException(409, "CATALOG_ITEM_UNAVAILABLE", "El producto o la variante ya no está disponible");
    }
    return {
      productId: product.id,
      categoryId: product.category.id,
      productName: product.name,
      variantId: variant.id,
      sku: variant.sku,
      variantLabel: variant.label,
      listPrice: variant.listPrice,
      currency: variant.currency,
    };
  }

  private product(value: unknown): {
    id: string;
    name: string;
    category: { id: string };
    variants: CatalogVariant[];
  } {
    if (!this.object(value) || !this.object(value.product)) {
      throw new ApiException(503, "CATALOG_UNAVAILABLE", "Catálogo devolvió una respuesta inválida");
    }
    const product = value.product;
    if (
      typeof product.id !== "string"
      || typeof product.name !== "string"
      || !this.object(product.category)
      || typeof product.category.id !== "string"
      || !Array.isArray(product.variants)
    ) {
      throw new ApiException(503, "CATALOG_UNAVAILABLE", "Catálogo devolvió una respuesta inválida");
    }
    const variants = product.variants.map((variant) => {
      if (
        !this.object(variant)
        || typeof variant.id !== "string"
        || typeof variant.sku !== "string"
        || typeof variant.label !== "string"
        || typeof variant.listPrice !== "number"
        || !Number.isFinite(variant.listPrice)
        || variant.listPrice < 0
        || typeof variant.currency !== "string"
        || !/^[A-Z]{3}$/.test(variant.currency)
      ) {
        throw new ApiException(503, "CATALOG_UNAVAILABLE", "Catálogo devolvió una respuesta inválida");
      }
      return {
        id: variant.id,
        sku: variant.sku,
        label: variant.label,
        listPrice: variant.listPrice,
        currency: variant.currency,
      };
    });
    return {
      id: product.id,
      name: product.name,
      category: { id: product.category.id },
      variants,
    };
  }

  private object(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
