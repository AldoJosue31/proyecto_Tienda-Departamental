import { cookies } from "next/headers";
import { z } from "zod";
import { gatewayJson, GatewayRequestError } from "@/lib/auth/gateway-client.server";
import { ACCESS_TOKEN_COOKIE, getCurrentUser } from "@/lib/auth/session.server";
import { promotionInputSchema } from "@/lib/pricing/promotions-schema";

export async function promotionRequest(request: Request, id?: string) {
  const correlationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  const headers = { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId };
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ message: "Debes iniciar sesión." }, { status: 401, headers });
    if (user.role !== "ADMIN") return Response.json({ message: "No tienes permisos para gestionar promociones." }, { status: 403, headers });
    if (id && !z.string().uuid().safeParse(id).success) return Response.json({ message: "Promoción inválida." }, { status: 400, headers });
    let payload: string | undefined;
    if (request.method !== "GET") {
      const parsed = promotionInputSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return Response.json({ message: parsed.error.issues[0]?.message ?? "Revisa la promoción." }, { status: 400, headers });
      payload = JSON.stringify(parsed.data);
    }
    const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
    const { body, response } = await gatewayJson<unknown>(id ? `/promotions/${encodeURIComponent(id)}` : "/promotions", {
      method: request.method, body: payload,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Correlation-Id": correlationId },
    });
    return Response.json(body, { status: response.status, headers });
  } catch (error) {
    return Response.json({ message: error instanceof GatewayRequestError ? error.message : "No fue posible contactar el servicio de precios." }, { status: error instanceof GatewayRequestError ? error.status : 503, headers });
  }
}
