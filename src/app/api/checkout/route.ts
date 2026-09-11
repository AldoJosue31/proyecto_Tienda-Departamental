import { cookies } from "next/headers";
import { z } from "zod";

import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";
import { ACCESS_TOKEN_COOKIE, getCurrentUser } from "@/lib/auth/session.server";

export const runtime = "nodejs";

const idempotencyKey = /^[A-Za-z0-9._:-]{1,200}$/;
const requestSchema = z.object({
  branchId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid(),
    quantity: z.number().int().positive().max(1_000_000),
  })).min(1).max(20),
});

export async function POST(request: Request) {
  const fallbackCorrelationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  try {
    const user = await getCurrentUser();
    if (!user) return failure(401, "UNAUTHENTICATED", "Debes iniciar sesión para confirmar tu compra.", fallbackCorrelationId);
    if (user.role !== "CUSTOMER") return failure(403, "FORBIDDEN", "La compra en línea está disponible para cuentas de cliente.", fallbackCorrelationId);

    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return failure(400, "VALIDATION_ERROR", "Revisa la sucursal y los artículos de tu compra.", fallbackCorrelationId);
    const key = request.headers.get("Idempotency-Key")?.trim();
    if (!key || !idempotencyKey.test(key)) return failure(400, "INVALID_IDEMPOTENCY_KEY", "No fue posible preparar una confirmación segura.", fallbackCorrelationId);

    const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
    if (!token) return failure(401, "UNAUTHENTICATED", "Tu sesión ya no está disponible. Inicia sesión nuevamente.", fallbackCorrelationId);
    const { body, correlationId, response } = await gatewayJson<unknown>("/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        "X-Correlation-Id": fallbackCorrelationId,
      },
      body: JSON.stringify({ ...parsed.data, channel: "ONLINE" }),
    });
    return Response.json(body, {
      status: response.status,
      headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    if (error instanceof GatewayRequestError) return failure(error.status, "ORDERS_UNAVAILABLE", error.message, error.correlationId);
    return failure(503, "ORDERS_UNAVAILABLE", "No fue posible confirmar tu compra en este momento.", fallbackCorrelationId);
  }
}

function failure(status: number, code: string, message: string, correlationId: string) {
  return Response.json({ code, message, correlationId }, { status, headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId } });
}
