import { sign } from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStatusClient } from "../src/auth/auth-status.client";
import { TokenService } from "../src/auth/token.service";
import { JwtAuthGuard } from "../src/common/jwt-auth.guard";
import { AUTH_JWT_ISSUER, createEphemeralTestSecret } from "../src/config/environment";

afterEach(() => { vi.unstubAllGlobals(); });

describe("human JWT guard identity state", () => {
  it("requires active Auth identity matching the signed role/version before assigning authUser", async () => {
    const secret = createEphemeralTestSecret();
    const token = sign({ role: "EMPLOYEE", uv: 2, jti: "session" }, secret, {
      algorithm: "HS256", issuer: AUTH_JWT_ISSUER, subject: "employee-1", expiresIn: "5m",
    });
    const request: { header: () => string; authUser?: unknown } = { header: () => "Bearer " + token };
    const context = { switchToHttp: () => ({ getRequest: () => request }) };
    for (const user of [
      { id: "employee-1", role: "EMPLOYEE", isActive: false, authVersion: 2 },
      { id: "employee-1", role: "EMPLOYEE", isActive: true, authVersion: 3 },
      { id: "employee-1", role: "CUSTOMER", isActive: true, authVersion: 2 },
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ user }))));
      const identities = new AuthStatusClient({ authServiceUrl: "http://auth.test", authStatusInternalServiceKey: createEphemeralTestSecret() });
      const guard = new JwtAuthGuard(new TokenService({ accessSecret: Buffer.from(secret) }), identities);
      await expect(guard.canActivate(context as never)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      expect(request.authUser).toBeUndefined();
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      user: { id: "employee-1", role: "EMPLOYEE", isActive: true, authVersion: 2 },
    }))));
    const identities = new AuthStatusClient({ authServiceUrl: "http://auth.test", authStatusInternalServiceKey: createEphemeralTestSecret() });
    expect(await new JwtAuthGuard(new TokenService({ accessSecret: Buffer.from(secret) }), identities).canActivate(context as never)).toBe(true);
    expect(request.authUser).toEqual({ id: "employee-1", role: "EMPLOYEE" });
  });

  it("rejects malformed bearer credentials before querying Auth", async () => {
    const identities = { isActive: vi.fn() };
    const guard = new JwtAuthGuard(new TokenService({ accessSecret: Buffer.from(createEphemeralTestSecret()) }), identities as unknown as AuthStatusClient);
    for (const header of ["", "Basic value", "Bearer value extra"]) {
      const context = { switchToHttp: () => ({ getRequest: () => ({ header: () => header }) }) };
      await expect(guard.canActivate(context as never)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    expect(identities.isActive).not.toHaveBeenCalled();
  });
});

