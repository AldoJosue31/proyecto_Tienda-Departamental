import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

export function couponServiceKey(purpose: "crm" | "orders"): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET is required for coupon communication.");
  return createHmac("sha256", secret).update("departamental:coupons:" + purpose + ":v1").digest("base64url");
}
@Injectable()
export class InternalCouponGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown>; path: string }>();
    const purpose = request.path.endsWith("/issue") ? "crm" : "orders";
    const supplied = request.headers["x-internal-service-key"];
    const expected = Buffer.from(couponServiceKey(purpose));
    const actual = typeof supplied === "string" ? Buffer.from(supplied) : Buffer.alloc(0);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new UnauthorizedException("Internal service authentication required.");
    return true;
  }
}
