import { describe, expect, it, vi } from "vitest";
import { sign } from "jsonwebtoken";

import { JwtAuthGuard } from "../src/common/jwt-auth.guard";
import { ApiException } from "../src/common/api-exception";
import {
  AUTH_JWT_ISSUER,
  createEphemeralTestSecret,
  type CatalogRuntimeConfig,
} from "../src/config/environment";
import { TokenService } from "../src/auth/token.service";

function tokenConfig(): CatalogRuntimeConfig {
  return {
    accessSecret: Buffer.from(createEphemeralTestSecret(), "utf8"),
    corsOrigins: ["http://localhost:3000"],
    environment: "test",
    searchCacheTtlSeconds: 120,
    productCacheTtlSeconds: 600,
  };
}

describe("Catalog JWT validation", () => {
  it("accepts the same HS256 issuer and role claims produced by Auth", () => {
    const config = tokenConfig();
    const token = sign(
      { role: "ADMIN" },
      config.accessSecret,
      {
        algorithm: "HS256",
        issuer: AUTH_JWT_ISSUER,
        subject: "a03effa0-6d5f-483d-b130-d3cf4b82f21d",
        jwtid: "1e8ee1b3-fc20-49cd-87f3-1d270674aaf3",
        expiresIn: 900,
      },
    );
    const tokens = new TokenService(config);
    const guard = new JwtAuthGuard(tokens);
    const request = {
      header: vi.fn().mockReturnValue(`Bearer ${token}`),
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    };

    expect(guard.canActivate(context as never)).toBe(true);
    expect(request).toMatchObject({
      authUser: {
        id: "a03effa0-6d5f-483d-b130-d3cf4b82f21d",
        role: "ADMIN",
      },
    });
  });

  it("rejects a token with a non-platform issuer", () => {
    const config = tokenConfig();
    const tokens = new TokenService(config);
    const wrongIssuerToken = sign(
      { role: "CUSTOMER" },
      config.accessSecret,
      {
        algorithm: "HS256",
        issuer: "untrusted-issuer",
        subject: "f2ea9bb2-40ca-4c4c-a558-4325a28cf61d",
        jwtid: "1c5ee374-5ff0-4cb2-9d67-4a0ea2986305",
        expiresIn: 900,
      },
    );

    expect(() => tokens.verifyAccessToken(wrongIssuerToken)).toThrow(ApiException);
  });
});
