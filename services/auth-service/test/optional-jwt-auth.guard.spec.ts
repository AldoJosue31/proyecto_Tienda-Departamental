import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { TokenService } from "../src/auth/token.service";
import { ApiException } from "../src/common/api-exception";
import { OptionalJwtAuthGuard } from "../src/common/optional-jwt-auth.guard";
import type { UsersRepository } from "../src/users/users.repository";

const user = {
  id: "2d0c7a3e-300e-4fc8-9aea-4214ff0eb73c",
  email: "customer@departamental.local",
  name: "Cliente local",
  role: "CUSTOMER" as const,
};

function contextFor(authorization?: string): {
  context: ExecutionContext;
  request: { header: (name: string) => string | undefined; authUser?: typeof user };
} {
  const request = {
    header: (name: string) => (name === "authorization" ? authorization : undefined),
  };
  return {
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
    request,
  };
}

function createGuard() {
  const tokens = {
    verifyAccessToken: vi.fn(),
  } as unknown as TokenService;
  const users = {
    findActiveById: vi.fn(),
  } as unknown as UsersRepository;
  return {
    guard: new OptionalJwtAuthGuard(tokens, users),
    tokens,
    users,
  };
}

describe("OptionalJwtAuthGuard", () => {
  it("allows a request without an access token", async () => {
    const { guard, tokens, users } = createGuard();
    const { context, request } = contextFor();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.authUser).toBeUndefined();
    expect(vi.mocked(tokens.verifyAccessToken)).not.toHaveBeenCalled();
    expect(vi.mocked(users.findActiveById)).not.toHaveBeenCalled();
  });

  it("allows an expired or malformed access token without resolving a user", async () => {
    const { guard, tokens, users } = createGuard();
    const { context, request } = contextFor("Bearer expired-token");
    vi.mocked(tokens.verifyAccessToken).mockImplementation(() => {
      throw new ApiException(401, "UNAUTHORIZED", "Token de acceso inválido o vencido");
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.authUser).toBeUndefined();
    expect(vi.mocked(users.findActiveById)).not.toHaveBeenCalled();
  });

  it("attaches the current user when the optional access token is valid", async () => {
    const { guard, tokens, users } = createGuard();
    const { context, request } = contextFor("Bearer valid-token");
    vi.mocked(tokens.verifyAccessToken).mockReturnValue({
      iss: "departamental-auth-service",
      sub: user.id,
      role: user.role,
      exp: 1_900_000_000,
      jti: "a527a2ee-b7a9-4e3d-92e7-0aea5809963f",
    });
    vi.mocked(users.findActiveById).mockResolvedValue(user);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.authUser).toEqual(user);
  });
});
