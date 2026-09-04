import { NextResponse, type NextRequest } from "next/server";

const accessTokenCookie = "departamental_access";
const refreshTokenCookie = "departamental_refresh";
const defaultGatewayUrl = "http://localhost:8000";
const refreshWindowMs = 60_000;

type RefreshPayload = {
  accessToken?: unknown;
  refreshToken?: unknown;
  expiresIn?: unknown;
  refreshExpiresIn?: unknown;
  tokenType?: unknown;
};

type ValidRefreshPayload = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  tokenType: "Bearer";
};

function gatewayUrl() {
  return (process.env.GATEWAY_INTERNAL_URL ?? defaultGatewayUrl).replace(/\/$/, "");
}

function loginResponse(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

function requiresSession(request: NextRequest) {
  return request.nextUrl.pathname !== "/";
}

function sessionFallback(request: NextRequest) {
  if (requiresSession(request)) return loginResponse(request);

  // The storefront is public. If a stale refresh cookie can no longer renew a
  // session, clear it and continue as an anonymous visitor instead of sending
  // a shopper to login just to browse the catalog.
  const next = NextResponse.next();
  next.cookies.delete(accessTokenCookie);
  next.cookies.delete(refreshTokenCookie);
  return next;
}

function shouldRefresh(token: string) {
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return true;
    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now() + refreshWindowMs;
  } catch {
    // A malformed or expired access cookie must not strand a valid refresh
    // session. Auth still verifies the opaque refresh token server-side.
    return true;
  }
}

function validRefreshPayload(payload: RefreshPayload): payload is ValidRefreshPayload {
  return typeof payload.accessToken === "string"
    && typeof payload.refreshToken === "string"
    && typeof payload.expiresIn === "number" && Number.isFinite(payload.expiresIn) && payload.expiresIn > 0
    && typeof payload.refreshExpiresIn === "number" && Number.isFinite(payload.refreshExpiresIn) && payload.refreshExpiresIn > 0
    && payload.tokenType === "Bearer";
}

async function refreshResponse(request: NextRequest, refreshToken: string, accessToken?: string) {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Correlation-Id": crypto.randomUUID(),
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(`${gatewayUrl()}/auth/refresh`, {
      method: "POST",
      headers,
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as RefreshPayload | null;
    if (!response.ok || !payload || !validRefreshPayload(payload)) return sessionFallback(request);

    // Cookies set on a Proxy response are only visible to the next request.
    // Retry this protected navigation so server-side authorization reads the
    // freshly minted access token instead of the expired incoming cookie.
    const next = NextResponse.redirect(new URL(request.url), 302);
    const secure = process.env.NODE_ENV === "production";
    next.cookies.set(accessTokenCookie, payload.accessToken, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: payload.expiresIn });
    next.cookies.set(refreshTokenCookie, payload.refreshToken, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: payload.refreshExpiresIn });
    return next;
  } catch {
    return sessionFallback(request);
  }
}

// This is only an optimistic redirect. Every page and protected route handler
// still verifies the session through Kong/Auth before returning data.
export async function proxy(request: NextRequest) {
  const accessToken = request.cookies.get(accessTokenCookie)?.value;
  const refreshToken = request.cookies.get(refreshTokenCookie)?.value;
  if (refreshToken && (!accessToken || shouldRefresh(accessToken))) return refreshResponse(request, refreshToken, accessToken);
  if (!accessToken && requiresSession(request)) return loginResponse(request);
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/operations/:path*", "/account/:path*", "/catalog/manage/:path*"],
};
