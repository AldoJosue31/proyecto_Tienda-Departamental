import { cookies } from "next/headers";
import { z } from "zod";

import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";
import { ACCESS_TOKEN_COOKIE, getCurrentUser } from "@/lib/auth/session.server";

export const runtime = "nodejs";

const movementSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  branchId: z.string().uuid(),
  type: z.enum(["RECEIPT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"]),
  quantity: z.number().int().min(1).max(1_000_000),
  reorderPoint: z.number().int().min(0).max(1_000_000).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
});

const productSchema = z.object({
  product: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    variants: z.array(z.object({
      id: z.string().uuid(),
      sku: z.string().min(1),
      label: z.string().min(1),
    })),
  }),
});

export async function POST(request: Request) {
  const fallbackCorrelationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  try {
    const user = await getCurrentUser();
    if (!user) return failure(401, "UNAUTHENTICATED", "Debes iniciar sesión para registrar un movimiento.", fallbackCorrelationId);
    if (user.role !== "ADMIN" && user.role !== "EMPLOYEE") {
      return failure(403, "FORBIDDEN", "No tienes permisos para registrar movimientos de inventario.", fallbackCorrelationId);
    }

    const input = movementSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return failure(400, "VALIDATION_ERROR", "Revisa la variante, sucursal, cantidad y punto de pedido.", fallbackCorrelationId);
    }

    const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
    if (!token) return failure(401, "UNAUTHENTICATED", "Tu sesión ya no está disponible. Inicia sesión nuevamente.", fallbackCorrelationId);

    const catalog = await gatewayJson<unknown>(`/products/${encodeURIComponent(input.data.productId)}`);
    if (!catalog.response.ok) {
      return failure(422, "CATALOG_VARIANT_UNAVAILABLE", "La variante ya no está disponible en el catálogo publicado.", catalog.correlationId);
    }
    const product = productSchema.safeParse(catalog.body);
    if (!product.success || product.data.product.id !== input.data.productId) {
      return failure(422, "CATALOG_VARIANT_UNAVAILABLE", "La variante no corresponde a un producto publicado.", catalog.correlationId);
    }
    const catalogProduct = product.data.product;
    const variant = catalogProduct.variants.find((candidate) => candidate.id === input.data.variantId);
    if (!variant) {
      return failure(422, "CATALOG_VARIANT_UNAVAILABLE", "La variante no corresponde a un producto publicado.", catalog.correlationId);
    }

    const movement = {
      variantId: input.data.variantId,
      branchId: input.data.branchId,
      type: input.data.type,
      quantity: input.data.quantity,
      reorderPoint: input.data.reorderPoint,
      reason: input.data.reason,
    };
    const result = await gatewayJson<unknown>("/inventory/movements", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Correlation-Id": fallbackCorrelationId,
      },
      body: JSON.stringify({
        ...movement,
        catalogSnapshot: {
          productName: catalogProduct.name,
          sku: variant.sku,
          variantLabel: variant.label,
        },
      }),
    });
    return Response.json(result.body, {
      status: result.response.status,
      headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": result.correlationId },
    });
  } catch (error) {
    if (error instanceof GatewayRequestError) {
      return failure(error.status, "INVENTORY_UNAVAILABLE", error.message, error.correlationId);
    }
    return failure(503, "INVENTORY_UNAVAILABLE", "No fue posible registrar el movimiento en este momento.", fallbackCorrelationId);
  }
}

function failure(status: number, code: string, message: string, correlationId: string) {
  return Response.json({ code, message, correlationId }, { status, headers: { "X-Correlation-Id": correlationId } });
}
