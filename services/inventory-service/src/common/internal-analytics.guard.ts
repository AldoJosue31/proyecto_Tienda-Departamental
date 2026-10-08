import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { INVENTORY_RUNTIME_CONFIG } from "../auth/token.service";
import type { InventoryRuntimeConfig } from "../config/environment";
import { ApiException } from "./api-exception";
import type { AuthenticatedRequest } from "./authenticated-request";

@Injectable()
export class InternalAnalyticsGuard implements CanActivate {
  constructor(@Inject(INVENTORY_RUNTIME_CONFIG) private readonly config: Pick<InventoryRuntimeConfig, "analyticsServiceSecret">) {}

  canActivate(context: ExecutionContext): boolean {
    const candidate = context.switchToHttp().getRequest<AuthenticatedRequest>().header("x-internal-service-key");
    const supplied = Buffer.from(candidate ?? "", "utf8");
    const expected = this.config.analyticsServiceSecret;
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new ApiException(401, "UNAUTHORIZED", "Servicio interno no autorizado");
    }
    return true;
  }
}
