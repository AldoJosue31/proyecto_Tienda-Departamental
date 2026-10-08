import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { InternalAnalyticsGuard } from "../common/internal-analytics.guard";
import { InventoryService } from "./inventory.service";

@Controller("internal/inventory")
@UseGuards(InternalAnalyticsGuard)
export class InventorySnapshotController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("snapshot")
  snapshot(@Query("cursor") cursor?: string) {
    return this.inventory.snapshot(cursor);
  }
}
