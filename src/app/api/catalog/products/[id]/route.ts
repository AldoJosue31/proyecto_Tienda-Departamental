import { z } from "zod";

import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const fallbackCorrelationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return failure(400, "INVALID_PRODUCT_ID", "El producto solicitado no es válido.", fallbackCorrelationId);

  try {
    const { body, correlationId, response } = await gatewayJson<unknown>(`/products/${encodeURIComponent(parsed.data.id)}`, {
      headers: { "X-Correlation-Id": fallbackCorrelationId },
    });
    return Response.json(body, {
      status: response.status,
      headers: { "Cache-Control": "no-store", "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    if (error instanceof GatewayRequestError) return failure(error.status, "CATALOG_UNAVAILABLE", error.message, error.correlationId);
    return failure(503, "CATALOG_UNAVAILABLE", "No fue posible consultar este producto. Intenta nuevamente.", fallbackCorrelationId);
  }
}

function failure(status: number, code: string, message: string, correlationId: string) {
  return Response.json({ code, message, correlationId }, {
    status,
    headers: { "Cache-Control": "no-store", "X-Correlation-Id": correlationId },
  });
}
