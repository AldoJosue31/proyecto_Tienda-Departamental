import type { MiddlewareConsumer } from "@nestjs/common";
import { Module, type NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { ORDERS_RUNTIME_CONFIG, TokenService } from "./auth/token.service";
import { CorrelationIdMiddleware } from "./common/correlation-id.middleware";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { RolesGuard } from "./common/roles.guard";
import { loadDatabaseConfig, loadOrdersRuntimeConfig } from "./config/environment";
import { DATABASE_CONFIG, DatabaseService } from "./database/database.service";
import { OrdersOutboxService } from "./events/outbox.service";
import { HealthController } from "./health/health.controller";
import { CatalogClient } from "./orders/catalog.client";
import { InventoryClient } from "./orders/inventory.client";
import { OrdersController } from "./orders/orders.controller";
import { OrdersRepository } from "./orders/orders.repository";
import { OrdersService } from "./orders/orders.service";
import { PricingClient } from "./orders/pricing.client";

@Module({
  controllers: [OrdersController, HealthController],
  providers: [
    { provide: DATABASE_CONFIG, useFactory: loadDatabaseConfig },
    { provide: ORDERS_RUNTIME_CONFIG, useFactory: loadOrdersRuntimeConfig },
    DatabaseService,
    OrdersOutboxService,
    TokenService,
    OrdersRepository,
    CatalogClient,
    PricingClient,
    InventoryClient,
    OrdersService,
    JwtAuthGuard,
    RolesGuard,
    CorrelationIdMiddleware,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes("*");
  }
}
