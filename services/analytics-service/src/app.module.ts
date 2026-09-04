import type { MiddlewareConsumer } from "@nestjs/common";
import { Module, type NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ANALYTICS_RUNTIME_CONFIG, TokenService } from "./auth/token.service";
import { AnalyticsConsumer } from "./analytics/analytics.consumer";
import { AnalyticsController } from "./analytics/analytics.controller";
import { AnalyticsService } from "./analytics/analytics.service";
import { CorrelationIdMiddleware } from "./common/correlation-id.middleware";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { RolesGuard } from "./common/roles.guard";
import { loadAnalyticsRuntimeConfig, loadDatabaseConfig } from "./config/environment";
import { DATABASE_CONFIG, DatabaseService } from "./database/database.service";
import { HealthController } from "./health/health.controller";

@Module({ controllers: [AnalyticsController, HealthController], providers: [
  { provide: DATABASE_CONFIG, useFactory: loadDatabaseConfig }, { provide: ANALYTICS_RUNTIME_CONFIG, useFactory: loadAnalyticsRuntimeConfig },
  DatabaseService, TokenService, AnalyticsService, AnalyticsConsumer, JwtAuthGuard, RolesGuard, CorrelationIdMiddleware,
  { provide: APP_FILTER, useClass: HttpExceptionFilter },
] })
export class AppModule implements NestModule { configure(consumer: MiddlewareConsumer): void { consumer.apply(CorrelationIdMiddleware).forRoutes("*"); } }
