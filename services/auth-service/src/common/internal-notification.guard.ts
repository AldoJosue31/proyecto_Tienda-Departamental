import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";

import type { NotificationInternalConfig } from "../config/environment";
import { ApiException } from "./api-exception";
import type { AuthenticatedRequest } from "./authenticated-request";

export const NOTIFICATION_INTERNAL_CONFIG = Symbol("NOTIFICATION_INTERNAL_CONFIG");

@Injectable()
export class InternalNotificationGuard implements CanActivate {
  constructor(@Inject(NOTIFICATION_INTERNAL_CONFIG) private readonly config: NotificationInternalConfig) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const candidate = request.header("x-internal-service-key")?.trim();
    const supplied = candidate ? Buffer.from(candidate, "utf8") : Buffer.alloc(0);
    if (!candidate || supplied.length !== this.config.serviceKey.length || !timingSafeEqual(supplied, this.config.serviceKey)) throw new ApiException(401, "UNAUTHORIZED", "Servicio interno no autorizado");
    return true;
  }
}
