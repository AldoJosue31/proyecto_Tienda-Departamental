import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("./session.server", () => ({ ACCESS_TOKEN_COOKIE: "departamental_access", getCurrentUser: vi.fn() }));
vi.mock("./gateway-client.server", async importOriginal => {
  const original = await importOriginal<typeof import("./gateway-client.server")>();
  return { ...original, gatewayJson: vi.fn() };
});

import { cookies } from "next/headers";
import { gatewayJson, GatewayRequestError } from "./gateway-client.server";
import { getCurrentUser } from "./session.server";
import { ONBOARDING_CSRF_COOKIE, ONBOARDING_NONCE_COOKIE, signedClientHeaders } from "./onboarding.server";
import { GET as contextGet } from "@/app/api/auth/onboarding/context/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { POST as confirmationPost } from "@/app/api/auth/email-verification/confirm/route";
import { POST as resendPost } from "@/app/api/auth/email-verification/resend/route";
import { POST as acceptPost } from "@/app/api/auth/employee-invitations/accept/route";
import { GET as employeesGet } from "@/app/api/auth/employees/route";
import { POST as invitationPost } from "@/app/api/auth/employees/invitations/route";
import { PATCH as statusPatch } from "@/app/api/auth/employees/[id]/status/route";
import { POST as invitationResendPost } from "@/app/api/auth/employees/[id]/invitation/resend/route";

const ORIGIN = "http://localhost:3105";
const CSRF = "c".repeat(43);
const TOKEN = "t".repeat(43);
const KEY = Buffer.alloc(32, 7).toString("base64url");
const EMPLOYEE_ID = "ec76e238-fdac-4c87-9dbd-252ee10b61b4";
const registration = { name: "Cliente", email: "Cliente@example.test", password: "una frase de acceso segura", returnPath: "/checkout?branch=centro" };
let cookieValues: Map<string, string>;
let cookieStore: {
  get: ReturnType<typeof vi.fn<(name: string) => { name: string; value: string } | undefined>>;
  set: ReturnType<typeof vi.fn<(name: string, value: string, options: Record<string, unknown>) => void>>;
  delete: ReturnType<typeof vi.fn<(name: string) => void>>;
};

function signedHeaders(timestamp = Date.now(), ip = "203.0.113.7") {
  return {
    "x-auth-client-ip": ip,
    "x-auth-client-timestamp": String(timestamp),
    "x-auth-client-signature": createHmac("sha256", KEY).update(timestamp + ":" + ip).digest("hex"),
  };
}
function mutation(body: unknown, extraHeaders: Record<string, string> = {}, method = "POST") {
  return new Request(ORIGIN + "/api/auth/fixture", {
    method,
    headers: { origin: ORIGIN, "sec-fetch-site": "same-origin", "content-type": "application/json; charset=utf-8", "x-csrf-token": CSRF, "x-correlation-id": "onboarding-fixture", ...signedHeaders(), ...extraHeaders },
    body: JSON.stringify(body),
  });
}
function outcome(body: unknown = { accepted: true }, status = 202) {
  vi.mocked(gatewayJson).mockResolvedValue({ body, correlationId: "gateway-fixture", response: Response.json(body, { status }) });
}
function administrator() {
  cookieValues.set("departamental_access", "admin-session-fixture");
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "administrator", email: "admin@example.test", name: "Admin", role: "ADMIN" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_PUBLIC_ORIGIN", ORIGIN);
  vi.stubEnv("TRUSTED_BFF_IP_KEY", KEY);
  cookieValues = new Map([[ONBOARDING_CSRF_COOKIE, CSRF]]);
  cookieStore = {
    get: vi.fn(name => { const value = cookieValues.get(name); return value === undefined ? undefined : { name, value }; }),
    set: vi.fn((name, value) => { cookieValues.set(name, value); }),
    delete: vi.fn(name => { cookieValues.delete(name); }),
  };
  vi.mocked(cookies).mockResolvedValue(cookieStore as never);
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  outcome();
});
afterEach(() => vi.unstubAllEnvs());

describe("Onboarding Origin, CSRF and request boundaries", () => {
  it("requires the configured Origin and a valid double-submit CSRF token before calling Auth", async () => {
    const variations: Record<string, string>[] = [
      { origin: "https://attacker.test" }, { origin: "" }, { "sec-fetch-site": "cross-site" },
      { "x-csrf-token": "" }, { "x-csrf-token": "a".repeat(43) },
    ];
    for (const headers of variations) {
      const response = await registerPost(mutation(registration, headers));
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    cookieValues.delete(ONBOARDING_CSRF_COOKIE);
    expect((await registerPost(mutation(registration))).status).toBe(403);
    expect(gatewayJson).not.toHaveBeenCalled();
  });

  it("validates the public origin independently of the request Host", async () => {
    for (const configured of ["", "https://example.test/path", "https://example.test?value=1", "https://user:pass@example.test", "ftp://example.test", "http://example.test"]) {
      vi.stubEnv("APP_PUBLIC_ORIGIN", configured);
      expect((await registerPost(mutation(registration, { origin: configured }))).status).toBe(503);
    }
    vi.stubEnv("APP_PUBLIC_ORIGIN", ORIGIN);
    expect((await registerPost(mutation(registration, { host: "attacker.test" }))).status).toBe(202);
  });

  it("accepts JSON with a charset, rejects lookalike media types and malformed bodies", async () => {
    expect((await registerPost(mutation(registration))).status).toBe(202);
    for (const type of ["text/plain", "application/json-malicious", "application/jsonp", ""]) {
      expect((await registerPost(mutation(registration, { "content-type": type }))).status).toBe(415);
    }
    const broken = mutation(registration);
    const request = new Request(broken, { body: "{invalid" });
    expect((await registerPost(request)).status).toBe(400);
  });

  it("limits streamed JSON by actual UTF-8 bytes and cancels excess bodies despite forged Content-Length", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ name: "🧡".repeat(3_000) }))); },
      cancel,
    });
    const template = mutation({});
    const request = new Request(template.url, { method: "POST", headers: { ...Object.fromEntries(template.headers), "content-length": "1" }, body, duplex: "half" } as RequestInit);
    expect((await registerPost(request)).status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(gatewayJson).not.toHaveBeenCalled();
  });

  it("blocks public privilege, identity-state and nonce fields before creating a request", async () => {
    for (const fields of [{ role: "ADMIN" }, { role: "EMPLOYEE" }, { isActive: true }, { authVersion: 1 }, { emailVerifiedAt: "2026-01-01" }, { browserNonce: TOKEN }]) {
      expect((await registerPost(mutation({ ...registration, ...fields }))).status).toBe(400);
    }
    expect(gatewayJson).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});

describe("Browser-bound registration and confirmation", () => {
  it("creates a server-owned HTTP-only nonce, preserves checkout and does not expose nonce in the response", async () => {
    const response = await registerPost(mutation(registration));
    expect(response.status).toBe(202);
    const [path, init] = vi.mocked(gatewayJson).mock.calls[0]!;
    const payload = JSON.parse(String(init?.body));
    expect(path).toBe("/auth/register");
    expect(payload).toMatchObject({ email: "cliente@example.test", returnPath: "/checkout?branch=centro" });
    expect(payload.browserNonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookieStore.set).toHaveBeenCalledWith(ONBOARDING_NONCE_COOKIE, payload.browserNonce, expect.objectContaining({ httpOnly: true, sameSite: "strict", path: "/", maxAge: 3600 }));
    expect(await response.text()).not.toContain(payload.browserNonce);
    expect(cookieStore.delete).not.toHaveBeenCalledWith("departamental_cart");
    await registerPost(mutation({ ...registration, email: "another@example.test" }));
    expect(cookieStore.set).toHaveBeenCalledOnce();
    expect(JSON.parse(String(vi.mocked(gatewayJson).mock.calls[1]![1]?.body)).browserNonce).toBe(payload.browserNonce);
  });

  it("forwards an existing browser nonce only for verification and removes it after success", async () => {
    cookieValues.set(ONBOARDING_NONCE_COOKIE, "n".repeat(43));
    outcome({ success: true, returnPath: "/checkout" }, 200);
    expect((await confirmationPost(mutation({ token: TOKEN }))).status).toBe(200);
    expect(JSON.parse(String(vi.mocked(gatewayJson).mock.calls[0]![1]?.body))).toEqual({ token: TOKEN, browserNonce: "n".repeat(43) });
    expect(cookieStore.delete).toHaveBeenCalledWith(ONBOARDING_NONCE_COOKIE);
    expect(cookieStore.set).not.toHaveBeenCalledWith("departamental_access", expect.anything(), expect.anything());
  });

  it("leaves cross-browser password verification to Auth without inventing a nonce", async () => {
    outcome({ success: true }, 200);
    await confirmationPost(mutation({ token: TOKEN, password: registration.password }));
    expect(JSON.parse(String(vi.mocked(gatewayJson).mock.calls[0]![1]?.body))).toEqual({ token: TOKEN, password: registration.password });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("retains the nonce on a rejected confirmation and does not overwrite identity data on resend", async () => {
    cookieValues.set(ONBOARDING_NONCE_COOKIE, "n".repeat(43));
    outcome({ code: "INVALID_CHALLENGE", message: "El enlace no es válido." }, 400);
    expect((await confirmationPost(mutation({ token: TOKEN }))).status).toBe(400);
    expect(cookieStore.delete).not.toHaveBeenCalled();
    outcome();
    expect((await resendPost(mutation({ email: " Cliente@Example.test " }))).status).toBe(202);
    expect(JSON.parse(String(vi.mocked(gatewayJson).mock.calls[1]![1]?.body))).toEqual({ email: "cliente@example.test" });
    expect((await resendPost(mutation({ email: "cliente@example.test", password: registration.password }))).status).toBe(400);
  });

  it("requires an invitation password and keeps invitation purpose separate", async () => {
    expect((await acceptPost(mutation({ token: TOKEN }))).status).toBe(400);
    outcome({ success: true }, 200);
    expect((await acceptPost(mutation({ token: TOKEN, password: registration.password }))).status).toBe(200);
    expect(vi.mocked(gatewayJson).mock.calls[0]![0]).toBe("/auth/employee-invitations/accept");
    expect(JSON.parse(String(vi.mocked(gatewayJson).mock.calls[0]![1]?.body))).not.toHaveProperty("browserNonce");
  });

  it("generates and reuses CSRF context without making it a session", async () => {
    cookieValues.clear();
    const first = await contextGet();
    const body = await first.json();
    expect(body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(cookieStore.set).toHaveBeenCalledWith(ONBOARDING_CSRF_COOKIE, body.csrfToken, expect.objectContaining({ httpOnly: true, sameSite: "strict", path: "/", maxAge: 3600 }));
    expect(await (await contextGet()).json()).toEqual(body);
    expect(cookieStore.set).toHaveBeenCalledOnce();
    expect(gatewayJson).not.toHaveBeenCalled();
  });

  it("marks onboarding cookies Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    cookieValues.clear();
    const production = await import("./onboarding.server");
    await production.onboardingContext();
    expect(cookieStore.set).toHaveBeenCalledWith(ONBOARDING_CSRF_COOKIE, expect.any(String), expect.objectContaining({ secure: true, httpOnly: true, sameSite: "strict" }));
  });
});

describe("Administrative employee BFF", () => {
  it("requires an authenticated administrator for reads and invitations", async () => {
    expect((await employeesGet(new Request(ORIGIN + "/api/auth/employees"))).status).toBe(401);
    for (const role of ["CUSTOMER", "EMPLOYEE"] as const) {
      vi.mocked(getCurrentUser).mockResolvedValue({ id: "fixture", email: "fixture@example.test", name: "Fixture", role });
      expect((await employeesGet(new Request(ORIGIN + "/api/auth/employees"))).status).toBe(403);
      expect((await invitationPost(mutation({ name: "Empleado", email: "employee@example.test" }, { "idempotency-key": "invitation-fixture" }))).status).toBe(403);
    }
    expect(gatewayJson).not.toHaveBeenCalled();
  });

  it("uses the administrator session, validates pagination and forwards the idempotency key exactly", async () => {
    administrator();
    expect((await employeesGet(new Request(ORIGIN + "/api/auth/employees?page=2&pageSize=5&search=Empleado"))).status).toBe(202);
    expect(vi.mocked(gatewayJson).mock.calls[0]).toMatchObject(["/auth/employees?page=2&pageSize=5&search=Empleado", { method: "GET", headers: { Authorization: "Bearer admin-session-fixture" } }]);
    for (const query of ["page=0", "pageSize=101", "role=ADMIN"]) expect((await employeesGet(new Request(ORIGIN + "/api/auth/employees?" + query))).status).toBe(400);
    expect((await invitationPost(mutation({ name: "Empleado", email: "employee@example.test" }))).status).toBe(400);
    expect((await invitationPost(mutation({ name: "Empleado", email: "employee@example.test" }, { "idempotency-key": "short" }))).status).toBe(400);
    expect((await invitationPost(mutation({ name: "Empleado", email: "employee@example.test" }, { "idempotency-key": "invitation-fixture" }))).status).toBe(202);
    expect(vi.mocked(gatewayJson).mock.calls[1]![1]?.headers).toMatchObject({ "Idempotency-Key": "invitation-fixture", Authorization: "Bearer admin-session-fixture" });
  });

  it("rejects invitation privilege fields, invalid identities and mutations without CSRF", async () => {
    administrator();
    expect((await invitationPost(mutation({ name: "Empleado", email: "employee@example.test", role: "ADMIN" }, { "idempotency-key": "invitation-fixture" }))).status).toBe(400);
    expect((await statusPatch(mutation({ isActive: false, authVersion: 1 }, {}, "PATCH"), { params: Promise.resolve({ id: "invalid" }) })).status).toBe(400);
    expect((await statusPatch(mutation({ isActive: false, authVersion: 1 }, { "x-csrf-token": "" }, "PATCH"), { params: Promise.resolve({ id: EMPLOYEE_ID }) })).status).toBe(403);
    expect(gatewayJson).not.toHaveBeenCalled();
  });

  it("passes status concurrency versions and requires an empty resend object", async () => {
    administrator();
    outcome({ success: true }, 200);
    expect((await statusPatch(mutation({ isActive: false, authVersion: 3 }, {}, "PATCH"), { params: Promise.resolve({ id: EMPLOYEE_ID }) })).status).toBe(200);
    expect(vi.mocked(gatewayJson).mock.calls[0]![0]).toBe("/auth/employees/" + EMPLOYEE_ID + "/status");
    expect(JSON.parse(String(vi.mocked(gatewayJson).mock.calls[0]![1]?.body))).toEqual({ isActive: false, authVersion: 3 });
    expect((await invitationResendPost(mutation({ role: "ADMIN" }), { params: Promise.resolve({ id: EMPLOYEE_ID }) })).status).toBe(400);
    expect((await invitationResendPost(mutation({}), { params: Promise.resolve({ id: EMPLOYEE_ID }) })).status).toBe(200);
    expect(vi.mocked(gatewayJson).mock.calls[1]![0]).toBe("/auth/employees/" + EMPLOYEE_ID + "/invitation/resend");
    expect(JSON.parse(String(vi.mocked(gatewayJson).mock.calls[1]![1]?.body))).toEqual({});
  });
});

describe("Signed client address and safe failures", () => {
  it("validates signatures, timestamps and IP addresses instead of accepting forwarded input", () => {
    const now = Date.now();
    const request = new Request(ORIGIN, { headers: signedHeaders(now) });
    expect(signedClientHeaders(request, now)["x-auth-client-ip"]).toBe("203.0.113.7");
    for (const headers of [
      { ...signedHeaders(now), "x-auth-client-ip": "203.0.113.99" },
      { ...signedHeaders(now), "x-auth-client-signature": "0".repeat(64) },
      signedHeaders(now - 60_001), signedHeaders(now + 60_001), signedHeaders(now, "invalid"),
    ]) expect(() => signedClientHeaders(new Request(ORIGIN, { headers }), now)).toThrow("no está disponible");
    vi.stubEnv("TRUSTED_BFF_IP_KEY", "");
    expect(() => signedClientHeaders(request, now)).toThrow("no está disponible");
  });

  it("normalizes transport errors without exposing tokens, links or internal messages", async () => {
    vi.mocked(gatewayJson).mockRejectedValue(new Error("http://localhost/verify-email#token=sensitive-fixture"));
    const response = await confirmationPost(mutation({ token: TOKEN }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "AUTH_UNAVAILABLE", message: "No pudimos contactar el servicio de identidad. Intenta nuevamente.", correlationId: "onboarding-fixture" });
    expect(response.headers.get("x-correlation-id")).toBe("onboarding-fixture");
    vi.mocked(gatewayJson).mockRejectedValue(new GatewayRequestError("internal sensitive-fixture", 502, "internal-fixture"));
    const gatewayFailure = await registerPost(mutation(registration));
    expect(gatewayFailure.status).toBe(502);
    expect(await gatewayFailure.text()).not.toContain("sensitive-fixture");
  });
});
