import type { MiddlewareConsumer } from "@nestjs/common";
import { Module, type NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { CRM_RUNTIME_CONFIG, TokenService } from "./auth/token.service";
import { CorrelationIdMiddleware } from "./common/correlation-id.middleware";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { RolesGuard } from "./common/roles.guard";
import { loadCrmRuntimeConfig, loadDatabaseConfig } from "./config/environment";
import { CrmConsumer } from "./crm/crm.consumer";
import { CampaignDeliveryConsumer } from "./crm/campaign-delivery.consumer";
import { CampaignOutboxService } from "./crm/campaign-outbox.service";
import { CrmController } from "./crm/crm.controller";
import { CrmService } from "./crm/crm.service";
import { DATABASE_CONFIG, DatabaseService } from "./database/database.service";
import { HealthController } from "./health/health.controller";

@Module({ controllers: [CrmController, HealthController], providers: [
  { provide: DATABASE_CONFIG, useFactory: loadDatabaseConfig }, { provide: CRM_RUNTIME_CONFIG, useFactory: loadCrmRuntimeConfig },
  DatabaseService, TokenService, CrmService, CrmConsumer, CampaignDeliveryConsumer, CampaignOutboxService, JwtAuthGuard, RolesGuard, CorrelationIdMiddleware,
  { provide: APP_FILTER, useClass: HttpExceptionFilter },
] })
export class AppModule implements NestModule { configure(consumer: MiddlewareConsumer): void { consumer.apply(CorrelationIdMiddleware).forRoutes("*"); } }
