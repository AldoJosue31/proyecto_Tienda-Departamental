import type { MiddlewareConsumer } from "@nestjs/common";
import { Module, type NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { TokenService, CATALOG_RUNTIME_CONFIG } from "./auth/token.service";
import { CacheService, CACHE_CONFIG } from "./cache/cache.service";
import { ProductsController, VariantsController } from "./catalog/catalog.controller";
import { CatalogRepository } from "./catalog/catalog.repository";
import { CatalogService } from "./catalog/catalog.service";
import { CorrelationIdMiddleware } from "./common/correlation-id.middleware";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { RolesGuard } from "./common/roles.guard";
import {
  loadCacheConfig,
  loadCatalogRuntimeConfig,
  loadDatabaseConfig,
} from "./config/environment";
import { DATABASE_CONFIG, DatabaseService } from "./database/database.service";
import { HealthController } from "./health/health.controller";

@Module({
  controllers: [ProductsController, VariantsController, HealthController],
  providers: [
    {
      provide: DATABASE_CONFIG,
      useFactory: loadDatabaseConfig,
    },
    {
      provide: CACHE_CONFIG,
      useFactory: loadCacheConfig,
    },
    {
      provide: CATALOG_RUNTIME_CONFIG,
      useFactory: loadCatalogRuntimeConfig,
    },
    DatabaseService,
    CacheService,
    TokenService,
    CatalogRepository,
    CatalogService,
    JwtAuthGuard,
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
