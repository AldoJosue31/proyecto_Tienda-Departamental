import { Injectable } from "@nestjs/common";

import { ApiException } from "../common/api-exception";
import type { AuthenticatedUser } from "../common/authenticated-request";
import { DatabaseService } from "../database/database.service";
import { RefreshTokensRepository } from "../refresh-tokens/refresh-tokens.repository";
import { UsersRepository } from "../users/users.repository";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import type {
  AdminUser,
  AuthUserRecord,
  IssuedRefreshToken,
  LoginResponse,
  PublicUser,
  SessionMetadata,
} from "./auth.types";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly refreshTokensRepository: RefreshTokensRepository,
    private readonly database: DatabaseService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async login(
    email: string,
    password: string,
    metadata: SessionMetadata,
  ): Promise<LoginResponse> {
    const user = await this.usersRepository.findByEmail(email);
    const isValid = user?.isActive
      ? await this.passwordService.verify(password, user.passwordHash)
      : false;

    if (!user || !isValid || !user.isActive) {
      // A single response prevents user-enumeration and account-state disclosure.
      throw new ApiException(401, "INVALID_CREDENTIALS", "Credenciales inválidas");
    }

    return this.createSession(this.toPublicUser(user), metadata);
  }

  async refresh(
    rawRefreshToken: string,
    metadata: SessionMetadata,
  ): Promise<LoginResponse> {
    const tokenHash = this.tokenService.hashRefreshToken(rawRefreshToken);

    return this.database.withTransaction(async (client) => {
      const stored = await this.refreshTokensRepository.findByHashForUpdate(
        client,
        tokenHash,
      );

      if (!stored) {
        throw this.invalidRefreshToken();
      }

      if (stored.revokedAt || stored.expiresAt.getTime() <= Date.now()) {
        // Reuse of a rotated token revokes its complete family before returning 401.
        if (stored.revokedAt) {
          await this.refreshTokensRepository.revokeFamily(client, stored.familyId);
        }
        throw this.invalidRefreshToken();
      }

      const user = await this.usersRepository.findActiveByIdForSession(
        client,
        stored.userId,
      );
      if (!user) {
        // A disabled or deleted account must not receive a replacement token.
        await this.refreshTokensRepository.revokeFamily(client, stored.familyId);
        throw this.invalidRefreshToken();
      }

      const replacement = this.tokenService.issueReplacementRefreshToken(
        stored.familyId,
      );
      await this.refreshTokensRepository.revokeForReplacement(
        client,
        stored.id,
        replacement.id,
      );
      await this.refreshTokensRepository.create(client, user.id, replacement, metadata);

      return this.toSessionResponse(user, replacement);
    });
  }

  async logout(
    rawRefreshToken?: string,
    currentUser?: AuthenticatedUser,
  ): Promise<void> {
    if (rawRefreshToken) {
      const tokenHash = this.tokenService.hashRefreshToken(rawRefreshToken);
      await this.database.withTransaction(async (client) => {
        const stored = await this.refreshTokensRepository.findByHashForUpdate(
          client,
          tokenHash,
        );
        if (
          stored &&
          !stored.revokedAt &&
          stored.expiresAt.getTime() > Date.now()
        ) {
          // The opaque refresh token is the session capability. Do not depend
          // on an access JWT here: it may have expired, which is the normal
          // condition when a user closes an idle session.
          await this.refreshTokensRepository.revoke(client, stored.id);
        }
      });
      // Logout is intentionally idempotent and does not reveal whether a
      // syntactically valid token maps to an active session.
      return;
    }

    if (!currentUser) {
      throw new ApiException(401, "UNAUTHORIZED", "Token de acceso requerido");
    }
    await this.refreshTokensRepository.revokeAllForUser(currentUser.id);
  }

  listUsers(): Promise<AdminUser[]> {
    return this.usersRepository.listUsers();
  }

  private async createSession(
    user: PublicUser,
    metadata: SessionMetadata,
  ): Promise<LoginResponse> {
    const refreshToken = this.tokenService.issueRefreshToken();
    await this.database.withTransaction(async (client) => {
      await this.refreshTokensRepository.create(client, user.id, refreshToken, metadata);
    });
    return this.toSessionResponse(user, refreshToken);
  }

  private toSessionResponse(
    user: PublicUser,
    refreshToken: IssuedRefreshToken,
  ): LoginResponse {
    const accessToken = this.tokenService.issueAccessToken(user);
    return {
      accessToken: accessToken.token,
      refreshToken: refreshToken.rawToken,
      tokenType: "Bearer",
      expiresIn: accessToken.expiresIn,
      refreshExpiresIn: refreshToken.expiresIn,
      user,
    };
  }

  private toPublicUser(user: AuthUserRecord): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  private invalidRefreshToken(): ApiException {
    return new ApiException(
      401,
      "INVALID_REFRESH_TOKEN",
      "Sesión no válida o expirada",
    );
  }
}
