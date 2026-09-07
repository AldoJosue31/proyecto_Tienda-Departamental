import { cookies } from "next/headers";

import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";
import { ACCESS_TOKEN_COOKIE, getCurrentUser } from "@/lib/auth/session.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const fallbackCorrelationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  try {
    const user = await getCurrentUser();
    if (!user) return failure(401, "UNAUTHENTICATED", "Inicia sesión para elegir una sucursal de retiro.", fallbackCorrelationId);
    if (user.role !== "CUSTOMER") return failure(403, "FORBIDDEN", "La compra en línea está disponible para cuentas de cliente.", fallbackCorrelationId);

    const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
    if (!token) return failure(401, "UNAUTHENTICATED", "Tu sesión ya no está disponible. Inicia sesión nuevamente.", fallbackCorrelationId);
    const { body, correlationId, response } = await gatewayJson<unknown>("/inventory/branches", {
      headers: { Authorization: `Bearer ${token}`, "X-Correlation-Id": fallbackCorrelationId },
    });
    return Response.json(body, {
      status: response.status,
      headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    if (error instanceof GatewayRequestError) return failure(error.status, "INVENTORY_UNAVAILABLE", error.message, error.correlationId);
    return failure(503, "INVENTORY_UNAVAILABLE", "No fue posible cargar las sucursales de retiro.", fallbackCorrelationId);
  }
}

function failure(status: number, code: string, message: string, correlationId: string) {
  return Response.json({ code, message, correlationId }, { status, headers: { "X-Correlation-Id": correlationId } });
}
