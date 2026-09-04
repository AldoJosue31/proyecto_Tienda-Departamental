import type { MiddlewareConsumer } from "@nestjs/common";
import { Module, type NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { LOGISTICS_RUNTIME_CONFIG, TokenService } from "./auth/token.service";
import { CorrelationIdMiddleware } from "./common/correlation-id.middleware";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { RolesGuard } from "./common/roles.guard";
import { loadDatabaseConfig, loadLogisticsRuntimeConfig } from "./config/environment";
import { DATABASE_CONFIG, DatabaseService } from "./database/database.service";
import { LogisticsOutboxService } from "./events/outbox.service";
import { HealthController } from "./health/health.controller";
import { ShipmentsConsumer } from "./shipments/shipments.consumer";
import { ShipmentsController } from "./shipments/shipments.controller";
import { ShipmentsService } from "./shipments/shipments.service";

@Module({ controllers: [ShipmentsController, HealthController], providers: [
  { provide: DATABASE_CONFIG, useFactory: loadDatabaseConfig }, { provide: LOGISTICS_RUNTIME_CONFIG, useFactory: loadLogisticsRuntimeConfig },
  DatabaseService, TokenService, LogisticsOutboxService, ShipmentsService, ShipmentsConsumer, JwtAuthGuard, RolesGuard, CorrelationIdMiddleware,
  { provide: APP_FILTER, useClass: HttpExceptionFilter },
] })
export class AppModule implements NestModule { configure(consumer: MiddlewareConsumer): void { consumer.apply(CorrelationIdMiddleware).forRoutes("*"); } }
