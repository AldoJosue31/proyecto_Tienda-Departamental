import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable } from "@nestjs/common";

import { TokenService } from "../auth/token.service";
import { ApiException } from "./api-exception";
import type { AuthenticatedRequest } from "./authenticated-request";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawToken = extractBearerToken(request.header("authorization"));
    const claims = this.tokenService.verifyAccessToken(rawToken);
    request.authUser = { id: claims.sub, role: claims.role };
    return true;
  }
}

export function extractBearerToken(header: string | undefined): string {
  if (!header) {
    throw new ApiException(401, "UNAUTHORIZED", "Token de acceso requerido");
  }
  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) {
    throw new ApiException(401, "UNAUTHORIZED", "Token de acceso requerido");
  }
  return token;
}
