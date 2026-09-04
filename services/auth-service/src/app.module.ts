import type { MiddlewareConsumer} from "@nestjs/common";
import { Module, type NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { PasswordService } from "./auth/password.service";
import { AUTH_TOKEN_CONFIG, TokenService } from "./auth/token.service";
import { CorrelationIdMiddleware } from "./common/correlation-id.middleware";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "./common/optional-jwt-auth.guard";
import { RolesGuard } from "./common/roles.guard";
import {
  DATABASE_CONFIG,
  DatabaseService,
} from "./database/database.service";
import { HealthController } from "./health/health.controller";
import { RefreshTokensRepository } from "./refresh-tokens/refresh-tokens.repository";
import { loadAuthTokenConfig, loadDatabaseConfig } from "./config/environment";
import { UsersRepository } from "./users/users.repository";

@Module({
  controllers: [AuthController, HealthController],
  providers: [
    {
      provide: DATABASE_CONFIG,
      useFactory: loadDatabaseConfig,
    },
    {
      provide: AUTH_TOKEN_CONFIG,
      useFactory: loadAuthTokenConfig,
    },
    DatabaseService,
    UsersRepository,
    RefreshTokensRepository,
    PasswordService,
    TokenService,
    AuthService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
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
