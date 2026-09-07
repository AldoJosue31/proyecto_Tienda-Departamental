import type { MiddlewareConsumer } from "@nestjs/common";
import { Module, type NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { CorrelationIdMiddleware } from "./common/correlation-id.middleware";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { loadDatabaseConfig, loadNotificationRuntimeConfig } from "./config/environment";
import { DATABASE_CONFIG, DatabaseService } from "./database/database.service";
import { HealthController } from "./health/health.controller";
import { AuthContactClient } from "./notifications/auth-contact.client";
import { EmailProvider } from "./notifications/email.provider";
import { NotificationConsumer } from "./notifications/notification.consumer";
import { NOTIFICATION_RUNTIME_CONFIG } from "./notifications/notification.config";
import { NotificationDeliveryService } from "./notifications/notification-delivery.service";
import { NotificationOutboxService } from "./notifications/notification-outbox.service";

@Module({ controllers: [HealthController], providers: [
  { provide: DATABASE_CONFIG, useFactory: loadDatabaseConfig },
  { provide: NOTIFICATION_RUNTIME_CONFIG, useFactory: loadNotificationRuntimeConfig },
  DatabaseService, CorrelationIdMiddleware, AuthContactClient, EmailProvider, NotificationDeliveryService, NotificationConsumer, NotificationOutboxService,
  { provide: APP_FILTER, useClass: HttpExceptionFilter },
] })
export class AppModule implements NestModule { configure(consumer: MiddlewareConsumer): void { consumer.apply(CorrelationIdMiddleware).forRoutes("*"); } }
