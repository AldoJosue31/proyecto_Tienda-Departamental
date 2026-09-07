import { Module } from "@nestjs/common";

import { REALTIME_RUNTIME_CONFIG, TokenService } from "./auth/token.service";
import { loadRealtimeRuntimeConfig } from "./config/environment";
import { HealthController } from "./health/health.controller";
import { InventoryStockConsumer } from "./realtime/inventory-stock.consumer";
import { CourierTrackingConsumer } from "./realtime/courier-tracking.consumer";
import { RealtimeGateway } from "./realtime/realtime.gateway";

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: REALTIME_RUNTIME_CONFIG,
      useFactory: loadRealtimeRuntimeConfig,
    },
    TokenService,
    RealtimeGateway,
    InventoryStockConsumer,
    CourierTrackingConsumer,
  ],
})
export class AppModule {}
