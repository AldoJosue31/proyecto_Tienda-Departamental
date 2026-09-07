import "server-only";

import { GatewayRequestError } from "@/lib/auth/gateway-client.server";
import { getCurrentUser } from "@/lib/auth/session.server";
import type { Role, SessionUser } from "@/lib/auth/roles";

type AuthorizationResult =
  | { user: SessionUser; response?: never }
  | { response: Response; user?: never };

function safeCorrelationId(value?: string | null) {
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : crypto.randomUUID();
}

export function legacyApiError(status: number, code: string, message: string, correlationId?: string | null) {
  const traceId = safeCorrelationId(correlationId);
  return Response.json({ code, message, correlationId: traceId }, { status, headers: { "X-Correlation-Id": traceId } });
}

/**
 * Compatibility protection for the legacy Next route handlers while their
 * domains are extracted into Nest services. It validates the session through
 * Kong/Auth; it never reads Auth's database or verifies a token locally.
 */
export async function authorizeLegacyApi(allowedRoles: readonly Role[], requestedCorrelationId?: string | null): Promise<AuthorizationResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { response: legacyApiError(401, "UNAUTHENTICATED", "Debes iniciar sesión para continuar.", requestedCorrelationId) };
    if (!allowedRoles.includes(user.role)) {
      return { response: legacyApiError(403, "FORBIDDEN", "No tienes permisos para realizar esta operación.", requestedCorrelationId) };
    }
    return { user };
  } catch (error) {
    if (error instanceof GatewayRequestError) {
      return { response: legacyApiError(503, "AUTH_UNAVAILABLE", "No pudimos validar tus permisos. Intenta nuevamente.", error.correlationId) };
    }
    return { response: legacyApiError(503, "AUTH_UNAVAILABLE", "No pudimos validar tus permisos. Intenta nuevamente.", requestedCorrelationId) };
  }
}
