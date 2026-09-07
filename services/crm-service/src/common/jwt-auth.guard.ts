import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { TokenService } from "../auth/token.service";
import { ApiException } from "./api-exception";
import type { AuthenticatedRequest } from "./authenticated-request";

@Injectable()
export class JwtAuthGuard implements CanActivate { constructor(private readonly tokenService: TokenService) {} canActivate(context: ExecutionContext): boolean { const request = context.switchToHttp().getRequest<AuthenticatedRequest>(); const [scheme, token, ...remaining] = request.header("authorization")?.trim().split(/\s+/) ?? []; if (scheme?.toLowerCase() !== "bearer" || !token || remaining.length) throw new ApiException(401, "UNAUTHORIZED", "Token de acceso requerido"); const claims = this.tokenService.verifyAccessToken(token); request.authUser = { id: claims.sub, role: claims.role }; return true; } }
