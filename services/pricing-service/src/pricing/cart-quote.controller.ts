import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { AuthenticatedRequest } from "../common/authenticated-request";
import { ApiException } from "../common/api-exception";
import { CouponsService } from "../coupons/coupons.service";
import { PricingService } from "./pricing.service";
import { BatchQuoteService } from "./batch-quote.service";
import { CartQuoteDto } from "./batch-quote.dto";

@Controller("pricing/cart")
@UseGuards(JwtAuthGuard)
export class CartQuoteController {
  constructor(private readonly batch: BatchQuoteService, private readonly pricing: PricingService, private readonly coupons: CouponsService) {}

  @Post("quote") @HttpCode(200)
  async quote(@Body() body: CartQuoteDto, @Req() request: AuthenticatedRequest) {
    if (!request.authUser) throw new ApiException(401, "UNAUTHORIZED", "Inicia sesión para cotizar.");
    if (body.items.length > 20) throw new ApiException(400, "CART_LIMIT", "La bolsa admite hasta 20 variantes.");
    const lines = await this.batch.resolve(body.items);
    if (new Set(lines.map(line => line.currency)).size !== 1) throw new ApiException(409, "MIXED_CURRENCY_ORDER", "Todas las líneas deben usar la misma moneda.");
    const result = await this.pricing.quoteMany(lines);
    const coupon = body.couponCode?.trim().toUpperCase();
    if (coupon && request.authUser.role !== "CUSTOMER") throw new ApiException(403, "FORBIDDEN", "El cupón se valida desde la cuenta del cliente.");
    const benefit = coupon ? await this.coupons.quote({ code: coupon, customerId: request.authUser.id, lines }) : null;
    const prices = result.quotes.map((quote, index) => {
      const unitPrice = benefit?.prices.find(price => price.variantId === quote.variantId)?.unitPrice ?? quote.effectivePrice;
      return { ...quote, productId: lines[index]!.productId, quantity: lines[index]!.quantity, effectivePrice: unitPrice, discountAmount: Math.round((quote.basePrice - unitPrice) * 100) / 100, discountPercentage: quote.basePrice ? Math.round((quote.basePrice - unitPrice) / quote.basePrice * 100) : 0, appliedPromotion: unitPrice < quote.effectivePrice ? null : quote.appliedPromotion, lineTotal: Math.round(unitPrice * lines[index]!.quantity * 100) / 100 };
    });
    const subtotal = Math.round(lines.reduce((total, line) => total + line.basePrice * line.quantity, 0) * 100) / 100;
    const total = Math.round(prices.reduce((total, price) => total + price.lineTotal, 0) * 100) / 100;
    if (subtotal > 9999999999.99 || total > 9999999999.99 || !Number.isSafeInteger(Math.round(subtotal * 100)) || !Number.isSafeInteger(Math.round(total * 100))) throw new ApiException(422, "TOTAL_LIMIT", "El importe supera el límite de una cotización.");
    const validUntil = benefit?.validUntil && benefit.validUntil < result.validUntil ? benefit.validUntil : result.validUntil;
    return { prices, subtotal, total, discountTotal: Math.round((subtotal - total) * 100) / 100, currency: lines[0]!.currency, quotedAt: result.quotes[0]!.quotedAt, validUntil };
  }
}
