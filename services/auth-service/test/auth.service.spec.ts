import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

import { AuthService } from "../src/auth/auth.service";
import type {
  AuthUserRecord,
  IssuedRefreshToken,
  PublicUser,
  SessionMetadata,
} from "../src/auth/auth.types";
import type { PasswordService } from "../src/auth/password.service";
import type { TokenService } from "../src/auth/token.service";
import { ApiException } from "../src/common/api-exception";
import type { DatabaseService } from "../src/database/database.service";
import type { RefreshTokensRepository } from "../src/refresh-tokens/refresh-tokens.repository";
import type { UsersRepository } from "../src/users/users.repository";

const user: AuthUserRecord = {
  id: "2d0c7a3e-300e-4fc8-9aea-4214ff0eb73c",
  email: "customer@departamental.local",
  name: "Cliente local",
  passwordHash: "hash-that-is-never-exposed",
  role: "CUSTOMER",
  isActive: true,
};

const publicUser: PublicUser = {
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
};

const metadata: SessionMetadata = {
  ipAddress: "127.0.0.1",
  userAgent: "vitest",
};

function issuedRefreshToken(
  id: string,
  familyId: string,
): IssuedRefreshToken {
  return {
    id,
    familyId,
    rawToken: "opaque-refresh-token-value-that-is-long-enough-for-validation",
    tokenHash: "a".repeat(64),
    expiresAt: new Date(Date.now() + 2_592_000_000),
    expiresIn: 2_592_000,
  };
}

function createService() {
  const users = {
    findByEmail: vi.fn(),
    findActiveById: vi.fn(),
    findActiveByIdForSession: vi.fn(),
  } as unknown as UsersRepository;
  const refreshTokens = {
    create: vi.fn(),
    findByHashForUpdate: vi.fn(),
    revokeForReplacement: vi.fn(),
    revokeFamily: vi.fn(),
    revoke: vi.fn(),
    revokeAllForUser: vi.fn(),
  } as unknown as RefreshTokensRepository;
  const database = {
    withTransaction: vi.fn(
      async <T>(operation: (client: PoolClient) => Promise<T>): Promise<T> =>
        operation({} as PoolClient),
    ),
  } as unknown as DatabaseService;
  const passwords = {
    verify: vi.fn(),
  } as unknown as PasswordService;
  const tokens = {
    hashRefreshToken: vi.fn(() => "b".repeat(64)),
    issueAccessToken: vi.fn(() => ({ token: "access-token", expiresIn: 900 })),
    issueRefreshToken: vi.fn(() =>
      issuedRefreshToken(
        "1e8ee1b3-fc20-49cd-87f3-1d270674aaf3",
        "78879142-9d54-4c3e-8396-1b05bc6ed379",
      ),
    ),
    issueReplacementRefreshToken: vi.fn((familyId: string) =>
      issuedRefreshToken("cd49e69c-2748-42e3-bff8-42df3b52540c", familyId),
    ),
  } as unknown as TokenService;

  return {
    service: new AuthService(users, refreshTokens, database, passwords, tokens),
    users,
    refreshTokens,
    passwords,
    tokens,
  };
}

describe("AuthService", () => {
  it("creates a session for a valid active user without returning the password hash", async () => {
    const { service, users, refreshTokens, passwords } = createService();
    vi.mocked(users.findByEmail).mockResolvedValue(user);
    vi.mocked(passwords.verify).mockResolvedValue(true);

    const result = await service.login(user.email, "correct-password", metadata);

    expect(result).toMatchObject({
      accessToken: "access-token",
      tokenType: "Bearer",
      expiresIn: 900,
      refreshExpiresIn: 2_592_000,
      user: publicUser,
    });
    expect(result).not.toHaveProperty("passwordHash");
    expect(vi.mocked(refreshTokens.create)).toHaveBeenCalledOnce();
  });

  it("rotates a valid refresh token without requiring an access-token user", async () => {
    const { service, refreshTokens, users } = createService();
    vi.mocked(users.findActiveByIdForSession).mockResolvedValue(publicUser);
    vi.mocked(refreshTokens.findByHashForUpdate).mockResolvedValue({
      id: "old-refresh-id",
      userId: user.id,
      tokenHash: "b".repeat(64),
      familyId: "family-id",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedByTokenId: null,
    });

    const result = await service.refresh("old-refresh-token", metadata);

    expect(result.accessToken).toBe("access-token");
    expect(vi.mocked(refreshTokens.revokeForReplacement)).toHaveBeenCalledWith(
      expect.anything(),
      "old-refresh-id",
      "cd49e69c-2748-42e3-bff8-42df3b52540c",
    );
    expect(vi.mocked(refreshTokens.create)).toHaveBeenCalledWith(
      expect.anything(),
      user.id,
      expect.objectContaining({ familyId: "family-id" }),
      metadata,
    );
    expect(vi.mocked(users.findActiveByIdForSession)).toHaveBeenCalledWith(
      expect.anything(),
      user.id,
    );
  });

  it("revokes a family when a previously rotated refresh token is reused", async () => {
    const { service, refreshTokens } = createService();
    vi.mocked(refreshTokens.findByHashForUpdate).mockResolvedValue({
      id: "revoked-refresh-id",
      userId: user.id,
      tokenHash: "b".repeat(64),
      familyId: "family-id",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      replacedByTokenId: "replacement-id",
    });

    await expect(
      service.refresh("reused-token", metadata),
    ).rejects.toBeInstanceOf(ApiException);
    expect(vi.mocked(refreshTokens.revokeFamily)).toHaveBeenCalledWith(
      expect.anything(),
      "family-id",
    );
  });

  it("revokes the supplied refresh session without an access token", async () => {
    const { service, refreshTokens } = createService();
    vi.mocked(refreshTokens.findByHashForUpdate).mockResolvedValue({
      id: "refresh-id",
      userId: user.id,
      tokenHash: "b".repeat(64),
      familyId: "family-id",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedByTokenId: null,
    });

    await service.logout("refresh-token-to-revoke");

    expect(vi.mocked(refreshTokens.revoke)).toHaveBeenCalledWith(
      expect.anything(),
      "refresh-id",
    );
  });

  it("does not reveal whether a syntactically valid logout token exists", async () => {
    const { service, refreshTokens } = createService();
    vi.mocked(refreshTokens.findByHashForUpdate).mockResolvedValue(null);

    await expect(service.logout("unknown-refresh-token")).resolves.toBeUndefined();
    expect(vi.mocked(refreshTokens.revoke)).not.toHaveBeenCalled();
  });

  it("requires a valid access-token user when logout has no refresh token", async () => {
    const { service, refreshTokens } = createService();

    await expect(service.logout()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      getStatus: expect.any(Function),
    });
    expect(vi.mocked(refreshTokens.revokeAllForUser)).not.toHaveBeenCalled();
  });

  it("revokes the full user session set only when logout has an authenticated user and no refresh token", async () => {
    const { service, refreshTokens } = createService();

    await service.logout(undefined, publicUser);

    expect(vi.mocked(refreshTokens.revokeAllForUser)).toHaveBeenCalledWith(user.id);
  });

  it("revokes the refresh family when its account is no longer active", async () => {
    const { service, refreshTokens, users } = createService();
    vi.mocked(refreshTokens.findByHashForUpdate).mockResolvedValue({
      id: "refresh-id",
      userId: user.id,
      tokenHash: "b".repeat(64),
      familyId: "family-id",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedByTokenId: null,
    });
    vi.mocked(users.findActiveByIdForSession).mockResolvedValue(null);

    await expect(service.refresh("refresh-token", metadata)).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
    expect(vi.mocked(refreshTokens.revokeFamily)).toHaveBeenCalledWith(
      expect.anything(),
      "family-id",
    );
  });
});
