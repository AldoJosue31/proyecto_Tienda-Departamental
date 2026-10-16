import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { TokenService } from "../auth/token.service";
import { AuthStatusClient } from "../auth/auth-status.client";
import { ApiException } from "./api-exception";
import type { AuthenticatedRequest } from "./authenticated-request";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService, private readonly identities: AuthStatusClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const claims = this.tokens.verifyAccessToken(extractBearerToken(request.header("authorization")));
    if (!await this.identities.isActive(claims)) {
      throw new ApiException(401, "UNAUTHORIZED", "La cuenta o sesión ya no está habilitada");
    }
    request.authUser = { id: claims.sub, role: claims.role };
    return true;
  }
}

export function extractBearerToken(header: string | undefined): string {
  const [scheme, token, ...remaining] = header?.trim().split(/\s+/) ?? [];
  if (scheme?.toLowerCase() !== "bearer" || !token || remaining.length) {
    throw new ApiException(401, "UNAUTHORIZED", "Token de acceso requerido");
  }
  return token;
}
