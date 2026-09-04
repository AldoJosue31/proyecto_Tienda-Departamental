import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { AnalyticsService } from "./analytics.service";
import type { InventoryByBranchResponse, SalesByBranchResponse, SalesTodayResponse, TicketAverageResponse, TopProductsResponse } from "./analytics.types";

@Controller("analytics")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
  @Get("sales/by-branch") salesByBranch(@Query("period") period?: string, @Query("currency") currency?: string): Promise<SalesByBranchResponse> { return this.analytics.salesByBranch(period, currency); }
  @Get("sales/today") salesToday(@Query("currency") currency?: string): Promise<SalesTodayResponse> { return this.analytics.salesToday(currency); }
  @Get("products/top") topProducts(@Query("period") period?: string, @Query("limit") limit?: string, @Query("currency") currency?: string): Promise<TopProductsResponse> { return this.analytics.topProducts(period, limit, currency); }
  @Get("ticket-average") ticketAverage(@Query("period") period?: string, @Query("currency") currency?: string): Promise<TicketAverageResponse> { return this.analytics.ticketAverage(period, currency); }
  @Get("inventory/by-branch") inventoryByBranch(): Promise<InventoryByBranchResponse> { return this.analytics.inventoryByBranch(); }
}
