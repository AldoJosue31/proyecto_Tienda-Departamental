import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../common/authenticated-request";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { CrmService } from "./crm.service";
import type { CampaignResponse, CouponCampaignInput, CustomerProfileResponse, CustomersResponse, InactiveSegmentResponse } from "./crm.types";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class CrmController {
  constructor(private readonly crm: CrmService) {}
  @Get("customers") customers(): Promise<CustomersResponse> { return this.crm.customers(); }
  @Get("customers/:id") customer(@Param("id") id: string): Promise<CustomerProfileResponse> { return this.crm.customerProfile(id); }
  @Get("customers/:id/purchases") purchases(@Param("id") id: string): Promise<CustomerProfileResponse> { return this.crm.customerProfile(id); }
  @Get("segments/inactive") inactive(@Query("months") months?: string): Promise<InactiveSegmentResponse> { return this.crm.inactiveSegment(months); }
  @Post("campaigns")
  @HttpCode(HttpStatus.ACCEPTED)
  createCampaign(@Body() body: CouponCampaignInput, @Headers("idempotency-key") idempotencyKey: string | undefined, @Req() request: AuthenticatedRequest): Promise<CampaignResponse> {
    if (!request.authUser) throw new Error("Authenticated user is unavailable.");
    return this.crm.createCampaign(body, request.authUser.id, idempotencyKey, request.correlationId ?? null);
  }
  @Get("campaigns/:id") campaign(@Param("id") id: string): Promise<CampaignResponse> { return this.crm.campaign(id); }
}
