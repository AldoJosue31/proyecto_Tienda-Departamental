import type { Server, Socket } from "socket.io";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sign } from "jsonwebtoken";
import { RealtimeGateway } from "../src/realtime/realtime.gateway";
import { TokenService } from "../src/auth/token.service";
import { AuthStatusClient } from "../src/auth/auth-status.client";
import { AUTH_JWT_ISSUER, createEphemeralTestSecret } from "../src/config/environment";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture() {
  const secret = createEphemeralTestSecret();
  const tokens = new TokenService({ accessSecret: Buffer.from(secret) });
  const identities = { isActive: vi.fn().mockResolvedValue(true) };
  const gateway = new RealtimeGateway(tokens, identities as unknown as AuthStatusClient, { corsOrigins: ["http://localhost:3105"] });
  const token = sign({ role: "EMPLOYEE", uv: 0, jti: "session" }, secret, { algorithm: "HS256", issuer: AUTH_JWT_ISSUER, subject: "employee-1", expiresIn: "5m" });
  const socket = {
    id: "socket-1", connected: true, conn: { readyState: "open" }, data: {},
    handshake: { headers: { origin: "http://localhost:3105", cookie: "departamental_access=" + token } },
    disconnect: vi.fn(),
  } as unknown as Socket;
  let middleware!: (socket: Socket, next: (error?: Error) => void) => void;
  gateway.afterInit({ use: (handler: typeof middleware) => { middleware = handler; } } as unknown as Server);
  const authenticate = () => new Promise<Error | undefined>((resolve) => { middleware(socket, resolve); });
  return { gateway, identities, socket, authenticate };
}

describe("Realtime identity revocation", () => {
  it("rejects a valid signed token when Auth reports the identity revoked", async () => {
    const f = fixture();
    f.identities.isActive.mockResolvedValue(false);
    expect((await f.authenticate())?.message).toBe("UNAUTHORIZED");
    expect(f.socket.data.identityClaims).toBeUndefined();
  });

  it("checks established connections and disconnects when state or version changes", async () => {
    vi.useFakeTimers();
    const f = fixture();
    expect(await f.authenticate()).toBeUndefined();
    f.gateway.handleConnection(f.socket);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.socket.disconnect).not.toHaveBeenCalled();
    f.identities.isActive.mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.socket.disconnect).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.socket.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops the sequential loop when a socket disconnects while Auth is pending", async () => {
    vi.useFakeTimers();
    const f = fixture();
    expect(await f.authenticate()).toBeUndefined();
    let complete!: (active: boolean) => void;
    f.identities.isActive.mockImplementation(() => new Promise<boolean>((resolve) => { complete = resolve; }));
    f.gateway.handleConnection(f.socket);
    await vi.advanceTimersByTimeAsync(1_000);
    f.gateway.handleDisconnect(f.socket);
    complete(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.identities.isActive).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the real 30-second client cache and blocks an open socket within 35 seconds", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "performance"] });
    const f = fixture();
    let active = true;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      user: { id: "employee-1", role: "EMPLOYEE", isActive: active, authVersion: 0 },
    }))));
    const identities = new AuthStatusClient({ authServiceUrl: "http://auth.test", authStatusInternalServiceKey: createEphemeralTestSecret() });
    const tokens = { verifyAccessToken: vi.fn().mockReturnValue({
      iss: AUTH_JWT_ISSUER, sub: "employee-1", role: "EMPLOYEE", uv: 0, jti: "session", exp: Date.now() / 1000 + 300,
    }) };
    const gateway = new RealtimeGateway(tokens as unknown as TokenService, identities, { corsOrigins: ["http://localhost:3105"] });
    let middleware!: (socket: Socket, next: (error?: Error) => void) => void;
    gateway.afterInit({ use: (handler: typeof middleware) => { middleware = handler; } } as unknown as Server);
    await new Promise<void>((resolve, reject) => { middleware(f.socket, (error) => error ? reject(error) : resolve()); });
    gateway.handleConnection(f.socket);
    active = false;
    await vi.advanceTimersByTimeAsync(29_000);
    expect(f.socket.disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.socket.disconnect).toHaveBeenCalledWith(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails closed on heartbeat errors and cancels connections at shutdown", async () => {
    vi.useFakeTimers();
    const f = fixture();
    expect(await f.authenticate()).toBeUndefined();
    f.gateway.handleConnection(f.socket);
    f.identities.isActive.mockRejectedValue(new Error("Unavailable"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.socket.disconnect).toHaveBeenCalledWith(true);
    expect(vi.getTimerCount()).toBe(0);
    f.gateway.handleConnection(f.socket);
    f.gateway.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
