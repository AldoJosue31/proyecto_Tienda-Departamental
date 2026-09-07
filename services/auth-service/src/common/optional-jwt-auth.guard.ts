import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable } from "@nestjs/common";

import { TokenService } from "../auth/token.service";
import { UsersRepository } from "../users/users.repository";
import { ApiException } from "./api-exception";
import type { AuthenticatedRequest } from "./authenticated-request";
import { extractBearerToken } from "./jwt-auth.guard";

/**
 * Best-effort access-token resolution for endpoints that also accept a
 * refresh-token capability. An expired or malformed access token must not
 * prevent a holder of a valid refresh token from ending that session.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly usersRepository: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header("authorization");

    if (!authorization) {
      return true;
    }

    let userId: string;
    try {
      const rawToken = extractBearerToken(authorization);
      userId = this.tokenService.verifyAccessToken(rawToken).sub;
    } catch (error) {
      // Only expected authentication failures are optional. Infrastructure
      // failures still propagate rather than being disguised as an anonymous request.
      if (error instanceof ApiException) {
        return true;
      }
      throw error;
    }

    const user = await this.usersRepository.findActiveById(userId);
    if (user) {
      request.authUser = user;
    }

    return true;
  }
}
