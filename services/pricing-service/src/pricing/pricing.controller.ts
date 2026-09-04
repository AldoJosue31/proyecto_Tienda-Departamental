import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import type { AuthenticatedRequest } from "../common/authenticated-request";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { CreatePromotionDto, QuoteQueryDto, UpdatePromotionDto } from "./pricing.dto";
import { PricingService } from "./pricing.service";
import type { Promotion, Quote } from "./pricing.types";

@Controller()
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get("pricing/quote")
  quote(@Query() query: QuoteQueryDto): Promise<Quote> {
    return this.pricing.quote(query);
  }

  @Get("promotions")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  list(): Promise<{ promotions: Promotion[] }> {
    return this.pricing.listPromotions();
  }

  @Post("promotions")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  create(
    @Body() body: CreatePromotionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ promotion: Promotion }> {
    if (!request.authUser) throw new Error("Authenticated user is unavailable.");
    return this.pricing.createPromotion(body, {
      ...request.authUser,
      correlationId: request.correlationId ?? null,
    });
  }

  @Patch("promotions/:id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  update(
    @Param("id") id: string,
    @Body() body: UpdatePromotionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ promotion: Promotion }> {
    if (!request.authUser) throw new Error("Authenticated user is unavailable.");
    return this.pricing.updatePromotion(id, body, {
      ...request.authUser,
      correlationId: request.correlationId ?? null,
    });
  }

  @Delete("promotions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  delete(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<void> {
    if (!request.authUser) throw new Error("Authenticated user is unavailable.");
    return this.pricing.deletePromotion(id, {
      ...request.authUser,
      correlationId: request.correlationId ?? null,
    });
  }
}
