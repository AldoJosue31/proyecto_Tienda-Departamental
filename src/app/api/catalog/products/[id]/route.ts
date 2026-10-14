import { z } from "zod";

import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";
import { enrichCatalogPrices } from "@/lib/pricing/catalog-pricing.server";
import type { CatalogProductSummary } from "@/lib/catalog/types";

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
    const product = (body as { product?: CatalogProductSummary } | null)?.product;
    const priced = response.ok && product ? await enrichCatalogPrices([product]) : null;
    return Response.json(priced ? { product: priced.items[0], pricingValidUntil: priced.pricingValidUntil } : body, {
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
