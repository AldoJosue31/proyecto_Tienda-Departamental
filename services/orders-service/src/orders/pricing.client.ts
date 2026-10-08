import { Inject, Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";

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
    private readonly config: Pick<OrdersRuntimeConfig, "pricingServiceUrl" | "upstreamTimeoutMilliseconds"> & Partial<Pick<OrdersRuntimeConfig, "accessSecret">>,
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

  async reserveCoupon(input: { code: string; customerId: string; orderId: string; lines: Array<{ variantId: string;productId:string;categoryId:string;basePrice:number;currency:string;quantity:number }> }): Promise<{prices:Array<{variantId:string;unitPrice:number;basePrice?:number}>}> {
    const value = await this.couponRequest("reserve", input);
    if (!this.object(value) || !Array.isArray(value.prices) || value.prices.length !== input.lines.length || !value.prices.every((price: unknown) => this.object(price) && typeof price.variantId === "string" && typeof price.unitPrice === "number" && Number.isFinite(price.unitPrice) && price.unitPrice >= 0 && typeof price.basePrice === "number" && Number.isFinite(price.basePrice) && price.basePrice >= price.unitPrice && input.lines.some(line=>line.variantId===price.variantId))) throw new ApiException(503,"PRICING_UNAVAILABLE","Precios devolvió un cupón inválido.");
    return value as {prices:Array<{variantId:string;unitPrice:number;basePrice?:number}>};
  }

  async settleCoupon(orderId: string, action: "commit" | "release" | "restore"): Promise<void> { await this.couponRequest("settle",{orderId,action}); }

  private async couponRequest(operation: string, body: unknown): Promise<unknown> {
    const secret = this.config.accessSecret ?? process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new ApiException(503,"PRICING_UNAVAILABLE","Falta la configuración privada de cupones.");
    try {
      const response = await fetch(new URL("/internal/coupons/"+operation,this.config.pricingServiceUrl),{method:"POST",headers:{"Content-Type":"application/json","x-internal-service-key":createHmac("sha256",secret).update("departamental:coupons:orders:v1").digest("base64url")},body:JSON.stringify(body),signal:AbortSignal.timeout(this.config.upstreamTimeoutMilliseconds)});
      const value = await response.json().catch(()=>null);
      if (!response.ok) {
        if (response.status < 500 && this.object(value) && typeof value.code === "string" && typeof value.message === "string") throw new ApiException(response.status,value.code,value.message);
        throw new ApiException(503,"PRICING_UNAVAILABLE","No fue posible confirmar el cupón.");
      }
      return value;
    } catch (error) { if (error instanceof ApiException) throw error; throw new ApiException(503,"PRICING_UNAVAILABLE","No fue posible confirmar el cupón."); }
  }

  private object(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
