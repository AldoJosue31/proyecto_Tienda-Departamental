import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { CouponsService, CouponLine } from "./coupons.service";
import { InternalCouponGuard } from "./internal-coupon.guard";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { AuthenticatedRequest } from "../common/authenticated-request";

@Controller()
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}
  @Post("internal/coupons/issue") @UseGuards(InternalCouponGuard)
  issue(@Body() body: Parameters<CouponsService["issue"]>[0]) { return this.coupons.issue(body); }
  @Post("internal/coupons/reserve") @UseGuards(InternalCouponGuard)
  reserve(@Body() body: Parameters<CouponsService["quote"]>[0]) { return this.coupons.quote(body,true); }
  @Post("internal/coupons/settle") @UseGuards(InternalCouponGuard)
  settle(@Body() body: { orderId: string; action: "commit" | "release" | "restore" }) { return this.coupons.settle(body.orderId,body.action); }
  @Post("pricing/coupons/quote") @HttpCode(200) @UseGuards(JwtAuthGuard,RolesGuard) @Roles("CUSTOMER")
  quote(@Body() body: { code: string; lines: CouponLine[] }, @Req() request: AuthenticatedRequest) { if (!request.authUser) throw new Error("Authenticated customer required."); return this.coupons.quote({ ...body,customerId:request.authUser.id }); }
}
