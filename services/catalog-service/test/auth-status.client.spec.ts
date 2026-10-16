import { sign } from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStatusClient, type IdentityClaims } from "../src/auth/auth-status.client";
import { TokenService } from "../src/auth/token.service";
import { AUTH_JWT_ISSUER, createEphemeralTestSecret } from "../src/config/environment";
import { loadAuthStatusConfig } from "../src/config/auth-status";

const key = createEphemeralTestSecret();
const config = { authServiceUrl: "http://auth.test:3001", authStatusInternalServiceKey: key };
const claims: IdentityClaims = { sub: "identity-1", role: "EMPLOYEE", uv: 0, exp: 4_000_000_000 };
const status = { id: claims.sub, role: claims.role, isActive: true, authVersion: 0 };
const response = (user: unknown, code = 200) => new Response(JSON.stringify({ user }), { status: code });

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("identity status authorization", () => {
  it("requires a separate strong status credential and an origin-only HTTP(S) URL", () => {
    expect(() => loadAuthStatusConfig({})).toThrow("AUTH_STATUS_INTERNAL_SERVICE_KEY");
    expect(() => loadAuthStatusConfig({ AUTH_STATUS_INTERNAL_SERVICE_KEY: key, AUTH_SERVICE_URL: "http://auth.test/private" })).toThrow();
    expect(loadAuthStatusConfig({ AUTH_STATUS_INTERNAL_SERVICE_KEY: key }).authServiceUrl).toBe("http://servicio-autenticacion:3001");
  });

  it("supports legacy version zero and rejects malformed version claims", () => {
    const secret = createEphemeralTestSecret();
    const tokens = new TokenService({ accessSecret: Buffer.from(secret, "utf8") });
    const mint = (payload: object) => sign({ role: "EMPLOYEE", jti: "session", ...payload }, secret, {
      algorithm: "HS256", issuer: AUTH_JWT_ISSUER, subject: claims.sub, expiresIn: "5m",
    });
    expect(tokens.verifyAccessToken(mint({})).uv).toBe(0);
    expect(tokens.verifyAccessToken(mint({ uv: 3 })).uv).toBe(3);
    for (const uv of [null, -1, 1.5, "0", Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => tokens.verifyAccessToken(mint({ uv }))).toThrow();
    }
  });

  it("checks current role and version on every request, including cached identities", async () => {
    const upstream = vi.fn().mockResolvedValue(response(status));
    vi.stubGlobal("fetch", upstream);
    const client = new AuthStatusClient(config);
    expect(await client.isActive(claims)).toBe(true);
    expect(await client.isActive({ ...claims, role: "ADMIN" })).toBe(false);
    expect(await client.isActive({ ...claims, uv: 1 })).toBe(false);
    expect(await client.isActive({ ...claims, exp: 1 })).toBe(false);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0]?.[0]).toBe("http://auth.test:3001/internal/auth/users/identity-1/status");
    expect(upstream.mock.calls[0]?.[1]).toMatchObject({ headers: { "x-internal-service-key": key, "cache-control": "no-store" }, redirect: "error" });
  });

  it("expires positive cache 30 seconds after request start, without adding response latency", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "performance"] });
    const upstream = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => {
      setTimeout(() => resolve(response(status)), 2_900);
    })).mockResolvedValue(response({ ...status, isActive: false }));
    vi.stubGlobal("fetch", upstream);
    const client = new AuthStatusClient(config);
    const initial = client.isActive(claims);
    await vi.advanceTimersByTimeAsync(2_900);
    expect(await initial).toBe(true);
    await vi.advanceTimersByTimeAsync(26_999);
    expect(await client.isActive(claims)).toBe(true);
    await vi.advanceTimersByTimeAsync(101);
    expect(await client.isActive(claims)).toBe(false);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent status requests without sharing role decisions", async () => {
    let resolve!: (value: Response) => void;
    const upstream = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal("fetch", upstream);
    const client = new AuthStatusClient(config);
    const results = [client.isActive(claims), client.isActive(claims), client.isActive({ ...claims, role: "ADMIN" })];
    resolve(response(status));
    expect(await Promise.all(results)).toEqual([true, true, false]);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("fails closed on missing, inactive, malformed and mismatched identities", async () => {
    const cases = [null, { ...status, id: "other" }, { ...status, role: "UNKNOWN" },
      { ...status, authVersion: -1 }, { ...status, authVersion: "0" }, { ...status, isActive: false }];
    for (const user of cases) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(user)));
      expect(await new AuthStatusClient(config).isActive(claims)).toBe(false);
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unavailable")));
    expect(await new AuthStatusClient(config).isActive(claims)).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(status, 503)));
    expect(await new AuthStatusClient(config).isActive(claims)).toBe(false);
  });

  it("does not reuse expired success while Auth is unavailable; reactivation keeps old JWT invalid", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "performance"] });
    const upstream = vi.fn().mockResolvedValueOnce(response(status)).mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValue(response({ ...status, authVersion: 2 }));
    vi.stubGlobal("fetch", upstream);
    const client = new AuthStatusClient(config);
    expect(await client.isActive(claims)).toBe(true);
    await vi.advanceTimersByTimeAsync(30_001);
    expect(await client.isActive(claims)).toBe(false);
    expect(await client.isActive(claims)).toBe(false);
    expect(await client.isActive({ ...claims, uv: 2 })).toBe(true);
    expect(upstream).toHaveBeenCalledTimes(3);
  });
});

