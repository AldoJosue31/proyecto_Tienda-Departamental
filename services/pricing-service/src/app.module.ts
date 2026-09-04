import type { MiddlewareConsumer } from "@nestjs/common";
import { Module, type NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { PRICING_RUNTIME_CONFIG, TokenService } from "./auth/token.service";
import { CorrelationIdMiddleware } from "./common/correlation-id.middleware";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { RolesGuard } from "./common/roles.guard";
import { loadDatabaseConfig, loadPricingRuntimeConfig } from "./config/environment";
import { DATABASE_CONFIG, DatabaseService } from "./database/database.service";
import { PricingOutboxService } from "./events/outbox.service";
import { HealthController } from "./health/health.controller";
import { PricingController } from "./pricing/pricing.controller";
import { PricingService } from "./pricing/pricing.service";

@Module({
  controllers: [PricingController, HealthController],
  providers: [
    { provide: DATABASE_CONFIG, useFactory: loadDatabaseConfig },
    { provide: PRICING_RUNTIME_CONFIG, useFactory: loadPricingRuntimeConfig },
    DatabaseService,
    PricingOutboxService,
    TokenService,
    PricingService,
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
