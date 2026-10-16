import { z } from "zod";
import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";

export const runtime = "nodejs";
const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) });
export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: "INVALID_PRODUCT_IDS", message: "Revisa los artículos solicitados.", correlationId }, { status: 400 });
  try {
    const result = await gatewayJson<unknown>("/products/resolve", { method: "POST", headers: { "Content-Type": "application/json", "X-Correlation-Id": correlationId }, body: JSON.stringify(parsed.data) });
    return Response.json(result.body, { status: result.response.status, headers: { "Cache-Control": "no-store", "X-Correlation-Id": result.correlationId } });
  } catch (error) {
    return Response.json({ code: "CATALOG_UNAVAILABLE", message: error instanceof GatewayRequestError ? error.message : "No fue posible verificar los artículos.", correlationId }, { status: 503 });
  }
}
