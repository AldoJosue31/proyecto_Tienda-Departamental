import { cookies } from "next/headers";
import { z } from "zod";
import { ACCESS_TOKEN_COOKIE, getCurrentUser } from "@/lib/auth/session.server";
import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";

export const runtime = "nodejs";
const schema = z.object({ items: z.array(z.object({ productId: z.string().uuid(), variantId: z.string().uuid(), quantity: z.number().int().min(1).max(1000000) })).min(1).max(20), couponCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,63}$/).optional() });
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ code: "UNAUTHENTICATED", message: "Inicia sesión para cotizar.", correlationId }, { status: 401 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ code: "VALIDATION_ERROR", message: "Revisa los artículos y el cupón.", correlationId }, { status: 400 });
    const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
    const result = await gatewayJson<unknown>("/pricing/cart/quote", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Correlation-Id": correlationId }, body: JSON.stringify(parsed.data) });
    return Response.json(result.body, { status: result.response.status, headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": result.correlationId } });
  } catch (error) {
    return Response.json({ code: "PRICING_UNAVAILABLE", message: error instanceof GatewayRequestError ? error.message : "No fue posible cotizar. Intenta actualizar los precios.", correlationId }, { status: 503, headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId } });
  }
}
