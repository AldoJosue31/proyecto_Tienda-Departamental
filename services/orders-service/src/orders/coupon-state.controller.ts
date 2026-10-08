import { CanActivate, Controller, ExecutionContext, Get, Injectable, Param, UnauthorizedException, UseGuards } from "@nestjs/common";
import { createHmac,timingSafeEqual } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { ApiException } from "../common/api-exception";

@Injectable()
export class CouponStateGuard implements CanActivate {
  canActivate(context:ExecutionContext):boolean {
    const secret=process.env.JWT_ACCESS_SECRET; if (!secret) throw new Error("JWT_ACCESS_SECRET required.");
    const expected=Buffer.from(createHmac("sha256",secret).update("departamental:coupons:orders:v1").digest("base64url"));
    const supplied=context.switchToHttp().getRequest<{headers:Record<string,unknown>}>().headers["x-internal-service-key"];
    const actual=typeof supplied === "string" ? Buffer.from(supplied) : Buffer.alloc(0);
    if (actual.length!==expected.length || !timingSafeEqual(actual,expected)) throw new UnauthorizedException("Internal service authentication required.");
    return true;
  }
}
@Controller("internal/coupons/orders") @UseGuards(CouponStateGuard)
export class CouponStateController {
  constructor(private readonly database:DatabaseService) {}
  @Get(":id") async get(@Param("id") id:string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiException(404,"ORDER_NOT_FOUND","Pedido no encontrado.");
    const result=await this.database.query<{status:string;outcome_code:string|null}>("SELECT o.status,i.outcome_code FROM orders o JOIN orders_idempotency i ON i.order_id=o.id WHERE o.id=$1",[id]);
    if (!result.rows[0]) throw new ApiException(404,"ORDER_NOT_FOUND","Pedido no encontrado.");
    return {status:result.rows[0].status,outcomeCode:result.rows[0].outcome_code};
  }
}
