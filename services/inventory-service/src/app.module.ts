import type { MiddlewareConsumer } from "@nestjs/common";
import { Module, type NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { INVENTORY_RUNTIME_CONFIG, TokenService } from "./auth/token.service";
import { CorrelationIdMiddleware } from "./common/correlation-id.middleware";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { InternalOrdersGuard } from "./common/internal-orders.guard";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { RolesGuard } from "./common/roles.guard";
import {
  loadDatabaseConfig,
  loadInventoryRuntimeConfig,
} from "./config/environment";
import { DATABASE_CONFIG, DatabaseService } from "./database/database.service";
import { OrderCancelledConsumer } from "./events/order-cancelled.consumer";
import { InventoryOutboxService } from "./events/outbox.service";
import { HealthController } from "./health/health.controller";
import { InventoryController } from "./inventory/inventory.controller";
import { InventoryService } from "./inventory/inventory.service";

@Module({
  controllers: [InventoryController, HealthController],
  providers: [
    {
      provide: DATABASE_CONFIG,
      useFactory: loadDatabaseConfig,
    },
    {
      provide: INVENTORY_RUNTIME_CONFIG,
      useFactory: loadInventoryRuntimeConfig,
    },
    DatabaseService,
    InventoryOutboxService,
    TokenService,
    InventoryService,
    OrderCancelledConsumer,
    JwtAuthGuard,
    InternalOrdersGuard,
    RolesGuard,
    CorrelationIdMiddleware,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes("*");
  }
}
