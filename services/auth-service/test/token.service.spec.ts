import { describe, expect, it } from "vitest";
import { sign, verify as verifyJwt } from "jsonwebtoken";

import { ApiException } from "../src/common/api-exception";
import {
  AUTH_JWT_ISSUER,
  createEphemeralTestSecret,
  loadAuthTokenConfig,
  type AuthTokenConfig,
} from "../src/config/environment";
import { TokenService } from "../src/auth/token.service";

function config(): AuthTokenConfig {
  return {
    accessSecret: Buffer.from(createEphemeralTestSecret(), "utf8"),
    accessTtlSeconds: 900,
    refreshTtlSeconds: 2_592_000,
    corsOrigins: ["http://localhost:3000"],
    environment: "test",
  };
}

describe("TokenService", () => {
  it("issues an HS256 access token with the agreed issuer and role claims", () => {
    const tokenConfig = config();
    const service = new TokenService(tokenConfig);

    const issued = service.issueAccessToken({
      id: "a03effa0-6d5f-483d-b130-d3cf4b82f21d",
      email: "admin@departamental.local",
      name: "Administrador",
      role: "ADMIN",
    });
    const claims = service.verifyAccessToken(issued.token);

    expect(issued.expiresIn).toBe(900);
    expect(claims).toMatchObject({
      iss: AUTH_JWT_ISSUER,
      sub: "a03effa0-6d5f-483d-b130-d3cf4b82f21d",
      role: "ADMIN",
    });
    expect(claims.jti).toEqual(expect.any(String));
    expect(claims.exp).toEqual(expect.any(Number));
  });

  it("rejects a token with a different issuer even when it uses the same secret", () => {
    const tokenConfig = config();
    const service = new TokenService(tokenConfig);
    const tokenWithWrongIssuer = sign(
      { role: "CUSTOMER" },
      tokenConfig.accessSecret,
      {
        algorithm: "HS256",
        issuer: "other-service",
        subject: "f2ea9bb2-40ca-4c4c-a558-4325a28cf61d",
        jwtid: "1c5ee374-5ff0-4cb2-9d67-4a0ea2986305",
        expiresIn: 900,
      },
    );

    expect(() => service.verifyAccessToken(tokenWithWrongIssuer)).toThrow(
      ApiException,
    );
  });

  it("uses the same literal base64url HMAC key configured in Kong", () => {
    const sharedSecret = createEphemeralTestSecret();
    const loadedConfig = loadAuthTokenConfig({
      NODE_ENV: "test",
      JWT_ACCESS_SECRET: sharedSecret,
    });
    const service = new TokenService(loadedConfig);
    const issued = service.issueAccessToken({
      id: "9c654f58-a06f-4e86-9a10-d4c2ba9f5467",
      email: "employee@departamental.local",
      name: "Empleado",
      role: "EMPLOYEE",
    });

    expect(() => verifyJwt(issued.token, sharedSecret, {
      algorithms: ["HS256"],
      issuer: AUTH_JWT_ISSUER,
    })).not.toThrow();
  });
});
