import { cookies } from "next/headers";

import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";
import { ACCESS_TOKEN_COOKIE, getCurrentUser } from "@/lib/auth/session.server";
import { customerOrdersResponseSchema } from "@/lib/orders/customer-orders";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const fallbackCorrelationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  try {
    const user = await getCurrentUser();
    if (!user) return failure(401, "UNAUTHENTICATED", "Inicia sesión para consultar tus pedidos.", fallbackCorrelationId);
    if (user.role !== "CUSTOMER") return failure(403, "FORBIDDEN", "Esta vista está disponible únicamente para cuentas de cliente.", fallbackCorrelationId);

    const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
    if (!token) return failure(401, "UNAUTHENTICATED", "Tu sesión ya no está disponible. Inicia sesión nuevamente.", fallbackCorrelationId);
    const { body, correlationId, response } = await gatewayJson<unknown>("/orders/mine", {
      headers: { Authorization: `Bearer ${token}`, "X-Correlation-Id": fallbackCorrelationId },
    });
    if (!response.ok) return failure(response.status, "ORDERS_UNAVAILABLE", messageFrom(body), correlationId);

    const parsed = customerOrdersResponseSchema.safeParse(body);
    if (!parsed.success) return failure(502, "ORDERS_INVALID_RESPONSE", "El historial de pedidos no tiene un formato válido.", correlationId);
    return Response.json(parsed.data, {
      headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    if (error instanceof GatewayRequestError) return failure(error.status, "ORDERS_UNAVAILABLE", error.message, error.correlationId);
    return failure(503, "ORDERS_UNAVAILABLE", "No fue posible cargar tus pedidos. Intenta nuevamente.", fallbackCorrelationId);
  }
}

function messageFrom(body: unknown) {
  return typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
    ? body.message
    : "No fue posible cargar tus pedidos. Intenta nuevamente.";
}

function failure(status: number, code: string, message: string, correlationId: string) {
  return Response.json({ code, message, correlationId }, { status, headers: { "X-Correlation-Id": correlationId } });
}
