import { sign } from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import { TokenService } from "../src/auth/token.service";
import { AUTH_JWT_ISSUER, createEphemeralTestSecret } from "../src/config/environment";

describe("TokenService", () => {
  it("acepta únicamente el JWT emitido por Auth con un rol conocido", () => {
    const secret = createEphemeralTestSecret();
    const token = sign({ role: "ADMIN", jti: "session-1" }, secret, {
      algorithm: "HS256",
      issuer: AUTH_JWT_ISSUER,
      subject: "user-1",
      expiresIn: "5m",
    });
    const service = new TokenService({ accessSecret: Buffer.from(secret, "utf8") });

    expect(service.verifyAccessToken(token)).toMatchObject({ sub: "user-1", role: "ADMIN" });
  });

  it("rechaza un token con rol fuera del contrato", () => {
    const secret = createEphemeralTestSecret();
    const token = sign({ role: "MANAGER", jti: "session-1" }, secret, {
      algorithm: "HS256",
      issuer: AUTH_JWT_ISSUER,
      subject: "user-1",
      expiresIn: "5m",
    });
    const service = new TokenService({ accessSecret: Buffer.from(secret, "utf8") });

    expect(() => service.verifyAccessToken(token)).toThrow();
  });
});
