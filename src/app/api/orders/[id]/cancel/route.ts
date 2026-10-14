import { cookies } from "next/headers";
import { z } from "zod";
import { gatewayJson, GatewayRequestError } from "@/lib/auth/gateway-client.server";
import { ACCESS_TOKEN_COOKIE, getCurrentUser } from "@/lib/auth/session.server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  const reply = (status: number, code: string, message: string) => Response.json({ code, message, correlationId }, { status, headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId } });
  try {
    const user = await getCurrentUser();
    if (!user) return reply(401, "UNAUTHENTICATED", "Inicia sesión para cancelar tu pedido.");
    if (user.role !== "CUSTOMER") return reply(403, "FORBIDDEN", "Esta acción está disponible para clientes.");
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return reply(400, "VALIDATION_ERROR", "La referencia de pedido no es válida.");
    const parsed = z.object({ reason: z.string().trim().max(500).optional() }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply(400, "VALIDATION_ERROR", "Revisa el motivo de cancelación.");
    const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
    if (!token) return reply(401, "UNAUTHENTICATED", "Tu sesión terminó. Inicia sesión nuevamente.");
    const result = await gatewayJson<unknown>(`/orders/${encodeURIComponent(id)}/cancel`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Correlation-Id": correlationId }, body: JSON.stringify(parsed.data) });
    return Response.json(result.body, { status: result.response.status, headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": result.correlationId } });
  } catch (error) {
    if (error instanceof GatewayRequestError) return reply(error.status, "CANCELLATION_UNAVAILABLE", error.message);
    return reply(503, "CANCELLATION_UNAVAILABLE", "No se pudo validar la cancelación. Puedes reintentar desde este pedido.");
  }
}
