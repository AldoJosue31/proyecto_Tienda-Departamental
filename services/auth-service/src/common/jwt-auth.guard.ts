import type {
  CanActivate,
  ExecutionContext} from "@nestjs/common";
import {
  Injectable,
} from "@nestjs/common";

import { ApiException } from "./api-exception";
import type { AuthenticatedRequest } from "./authenticated-request";
import { TokenService } from "../auth/token.service";
import { UsersRepository } from "../users/users.repository";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawToken = extractBearerToken(request.header("authorization"));
    const claims = this.tokenService.verifyAccessToken(rawToken);
    const user = await this.usersRepository.findActiveById(claims.sub);

    if (!user) {
      throw new ApiException(401, "UNAUTHORIZED", "Sesión no válida o expirada");
    }

    // The current DB role is authoritative if a role changes after JWT issuance.
    request.authUser = user;
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
