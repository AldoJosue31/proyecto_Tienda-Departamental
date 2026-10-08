import { z } from "zod";

import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";

export const runtime = "nodejs";

const querySchema = z.object({
  search: z.string().trim().max(200).optional(),
  category: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  const fallbackCorrelationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  const input = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    search: input.get("search") ?? undefined,
    category: input.get("category") ?? undefined,
    brand: input.get("brand") ?? undefined,
    page: input.get("page") ?? undefined,
    pageSize: input.get("pageSize") ?? undefined,
  });

  if (!parsed.success) return failure(400, "INVALID_CATALOG_SEARCH", "Revisa los filtros del catálogo.", fallbackCorrelationId);

  const search = new URLSearchParams({ page: String(parsed.data.page), pageSize: String(parsed.data.pageSize) });
  if (parsed.data.search) search.set("search", parsed.data.search);
  if (parsed.data.category) search.set("category", parsed.data.category);
  if (parsed.data.brand) search.set("brand", parsed.data.brand);

  try {
    const { body, correlationId, response } = await gatewayJson<unknown>(`/products?${search.toString()}`, {
      headers: { "X-Correlation-Id": fallbackCorrelationId },
    });
    return Response.json(body, {
      status: response.status,
      headers: { "Cache-Control": "no-store", "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    if (error instanceof GatewayRequestError) return failure(error.status, "CATALOG_UNAVAILABLE", error.message, error.correlationId);
    return failure(503, "CATALOG_UNAVAILABLE", "No fue posible cargar el catálogo. Intenta nuevamente.", fallbackCorrelationId);
  }
}

function failure(status: number, code: string, message: string, correlationId: string) {
  return Response.json({ code, message, correlationId }, {
    status,
    headers: { "Cache-Control": "no-store", "X-Correlation-Id": correlationId },
  });
}
