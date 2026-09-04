import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { Role } from "../config/environment";
import { ApiException } from "./api-exception";
import type { AuthenticatedRequest } from "./authenticated-request";
import { REQUIRED_ROLES } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.authUser || !requiredRoles.includes(request.authUser.role)) {
      throw new ApiException(403, "FORBIDDEN", "No tienes permisos para esta operación");
    }
    return true;
  }
}
