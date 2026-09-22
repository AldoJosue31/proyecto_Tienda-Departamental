import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";

import { LOGISTICS_RUNTIME_CONFIG } from "../auth/token.service";
import type { LogisticsRuntimeConfig } from "../config/environment";
import { ApiException } from "./api-exception";
import type { AuthenticatedRequest } from "./authenticated-request";

// This guard is deliberately used only by a route that Kong never exposes.
// It authenticates the Orders service, not an end-user JWT.
@Injectable()
export class InternalOrdersGuard implements CanActivate {
  constructor(
    @Inject(LOGISTICS_RUNTIME_CONFIG)
    private readonly config: Pick<LogisticsRuntimeConfig, "internalOrdersServiceKey">,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const candidate = request.header("x-internal-service-key")?.trim();
    if (!candidate || !this.matchesConfiguredSecret(candidate)) {
      throw new ApiException(401, "UNAUTHORIZED", "Servicio interno no autorizado");
    }
    return true;
  }

  private matchesConfiguredSecret(candidate: string): boolean {
    const supplied = Buffer.from(candidate, "utf8");
    const expected = this.config.internalOrdersServiceKey;
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }
}
