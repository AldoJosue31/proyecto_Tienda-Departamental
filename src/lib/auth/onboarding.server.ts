import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { cookies } from "next/headers";
import { z } from "zod";
import { gatewayJson, GatewayRequestError } from "./gateway-client.server";
import { ACCESS_TOKEN_COOKIE, getCurrentUser } from "./session.server";
import { safeReturnPath } from "./safe-return-path";

export const ONBOARDING_NONCE_COOKIE = "departamental_onboarding_nonce";
export const ONBOARDING_CSRF_COOKIE = "departamental_onboarding_csrf";
const secretFormat = /^[A-Za-z0-9_-]{43,128}$/;
const options = { httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 3600 };
class OnboardingError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
function headers(correlationId: string) { return { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId }; }
function trace(request: Request) {
  const value = request.headers.get("X-Correlation-Id");
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : crypto.randomUUID();
}
function equal(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function signedClientHeaders(request: Request, now = Date.now()) {
  const key = process.env.TRUSTED_BFF_IP_KEY || "";
  const ip = request.headers.get("x-auth-client-ip") || "";
  const timestamp = request.headers.get("x-auth-client-timestamp") || "";
  const signature = request.headers.get("x-auth-client-signature") || "";
  if (!/^[A-Za-z0-9_-]+$/.test(key) || Buffer.from(key, "base64url").length < 32 || !isIP(ip) || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 60000 || !/^[a-f0-9]{64}$/.test(signature)) {
    throw new OnboardingError(503, "ONBOARDING_UNAVAILABLE", "El servicio de registro no está disponible.");
  }
  const expected = createHmac("sha256", key).update(timestamp + ":" + ip).digest("hex");
  if (!equal(signature, expected)) throw new OnboardingError(503, "ONBOARDING_UNAVAILABLE", "El servicio de registro no está disponible.");
  return { "x-auth-client-ip": ip, "x-auth-client-timestamp": timestamp, "x-auth-client-signature": signature };
}
export async function assertOnboardingMutation(request: Request) {
  const configured = process.env.APP_PUBLIC_ORIGIN || "";
  let expected: string;
  try {
    const url = new URL(configured);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    expected = url.origin;
    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password
      || !(url.protocol === "https:" || (url.protocol === "http:" && local))) throw new Error();
  }
  catch { throw new OnboardingError(503, "ONBOARDING_UNAVAILABLE", "El servicio de registro no está disponible."); }
  if (request.headers.get("origin") !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw new OnboardingError(403, "INVALID_ORIGIN", "La solicitud debe realizarse desde la aplicación.");
  const provided = request.headers.get("x-csrf-token") || "";
  const stored = (await cookies()).get(ONBOARDING_CSRF_COOKIE)?.value || "";
  if (!secretFormat.test(provided) || !secretFormat.test(stored) || !equal(provided, stored)) throw new OnboardingError(403, "INVALID_CSRF_TOKEN", "Actualiza la página e intenta nuevamente.");
}
async function readBody(request: Request) {
  if ((request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new OnboardingError(415, "JSON_REQUIRED", "La solicitud debe contener JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new OnboardingError(400, "INVALID_REQUEST", "Revisa los datos enviados.");
  const parts: Uint8Array[] = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 8192) { await reader.cancel(); throw new OnboardingError(413, "REQUEST_TOO_LARGE", "La solicitud es demasiado grande."); }
    parts.push(value);
  }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown; }
  catch { throw new OnboardingError(400, "INVALID_REQUEST", "Revisa los datos enviados."); }
}
function errorResponse(error: unknown, correlationId: string) {
  if (error instanceof OnboardingError) return Response.json({ code: error.code, message: error.message, correlationId }, { status: error.status, headers: headers(correlationId) });
  return Response.json({ code: "AUTH_UNAVAILABLE", message: "No pudimos contactar el servicio de identidad. Intenta nuevamente.", correlationId }, { status: error instanceof GatewayRequestError ? error.status : 503, headers: headers(correlationId) });
}
export async function onboardingContext() {
  const store = await cookies();
  let token = store.get(ONBOARDING_CSRF_COOKIE)?.value;
  if (!token || !secretFormat.test(token)) { token = randomBytes(32).toString("base64url"); store.set(ONBOARDING_CSRF_COOKIE, token, options); }
  return Response.json({ csrfToken: token }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function publicOnboarding(request: Request, path: string, schema: z.ZodType, kind: "register" | "confirm" | "resend" | "accept") {
  const correlationId = trace(request);
  try {
    await assertOnboardingMutation(request);
    const parsed = schema.safeParse(await readBody(request));
    if (!parsed.success) throw new OnboardingError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message || "Revisa los datos enviados.");
    const payload = parsed.data as Record<string, unknown>;
    const store = await cookies();
    if (kind === "register") {
      let nonce = store.get(ONBOARDING_NONCE_COOKIE)?.value;
      if (!nonce || !secretFormat.test(nonce)) { nonce = randomBytes(32).toString("base64url"); store.set(ONBOARDING_NONCE_COOKIE, nonce, options); }
      payload.browserNonce = nonce;
      payload.returnPath = safeReturnPath(payload.returnPath, "CUSTOMER");
    } else if (kind === "confirm") {
      const nonce = store.get(ONBOARDING_NONCE_COOKIE)?.value;
      if (nonce && secretFormat.test(nonce)) payload.browserNonce = nonce;
    }
    const result = await gatewayJson<unknown>(path, { method: "POST", headers: { ...signedClientHeaders(request), "Content-Type": "application/json", "X-Correlation-Id": correlationId }, body: JSON.stringify(payload) });
    if (kind === "confirm" && result.response.ok) store.delete(ONBOARDING_NONCE_COOKIE);
    return Response.json(result.body, { status: result.response.status, headers: headers(correlationId) });
  } catch (error) { return errorResponse(error, correlationId); }
}
export async function employeeRequest(request: Request, path: string, schema?: z.ZodType, id?: string) {
  const correlationId = trace(request);
  try {
    if (request.method !== "GET") await assertOnboardingMutation(request);
    const user = await getCurrentUser();
    if (!user) throw new OnboardingError(401, "UNAUTHENTICATED", "Debes iniciar sesión.");
    if (user.role !== "ADMIN") throw new OnboardingError(403, "FORBIDDEN", "No tienes permisos para administrar empleados.");
    if (id && !z.string().uuid().safeParse(id).success) throw new OnboardingError(400, "INVALID_EMPLOYEE", "El empleado no es válido.");
    let payload: unknown;
    if (schema) {
      const parsed = schema.safeParse(request.method === "GET" ? Object.fromEntries(new URL(request.url).searchParams) : await readBody(request));
      if (!parsed.success) throw new OnboardingError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message || "Revisa los datos enviados.");
      payload = parsed.data;
    }
    const key = request.headers.get("Idempotency-Key");
    if (path === "/auth/employees/invitations" && (!key || !/^[A-Za-z0-9._:-]{8,128}$/.test(key))) throw new OnboardingError(400, "IDEMPOTENCY_KEY_REQUIRED", "La invitación necesita una clave de reintento.");
    const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
    const query = request.method === "GET" && payload ? "?" + new URLSearchParams(Object.entries(payload as Record<string, unknown>).filter(([, value]) => value !== undefined).map(([name, value]) => [name, String(value)])) : "";
    const result = await gatewayJson<unknown>(path + query, { method: request.method, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "X-Correlation-Id": correlationId, ...(key ? { "Idempotency-Key": key } : {}) }, ...(request.method !== "GET" && payload ? { body: JSON.stringify(payload) } : {}) });
    return Response.json(result.body, { status: result.response.status, headers: headers(correlationId) });
  } catch (error) { return errorResponse(error, correlationId); }
}
