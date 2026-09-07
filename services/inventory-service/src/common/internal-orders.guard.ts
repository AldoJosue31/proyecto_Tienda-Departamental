import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";

import { INVENTORY_RUNTIME_CONFIG } from "../auth/token.service";
import type { InventoryRuntimeConfig } from "../config/environment";
import { ApiException } from "./api-exception";
import type { AuthenticatedRequest } from "./authenticated-request";

export const INTERNAL_ORDERS_ACTOR = "orders-service";

@Injectable()
export class InternalOrdersGuard implements CanActivate {
  constructor(
    @Inject(INVENTORY_RUNTIME_CONFIG)
    private readonly config: Pick<InventoryRuntimeConfig, "internalServiceSecret">,
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
    const expected = this.config.internalServiceSecret;
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }
}
