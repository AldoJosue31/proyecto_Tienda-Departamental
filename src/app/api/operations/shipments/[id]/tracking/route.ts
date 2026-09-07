import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session.server";
import { PickPackRequestError, updatePickPackTracking } from "@/lib/logistics/pick-pack.server";

export const runtime = "nodejs";

const inputSchema = z.object({
  courierId: z.string().uuid(),
  courierName: z.string().trim().min(1).max(120),
  deliveryAddress: z.string().trim().min(1).max(500),
  version: z.number().int().positive(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const correlationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    if (!user) return Response.json({ code: "UNAUTHENTICATED", message: "Debes iniciar sesión para continuar.", correlationId }, { status: 401, headers: { "X-Correlation-Id": correlationId } });
    if (user.role !== "ADMIN" && user.role !== "EMPLOYEE") return Response.json({ code: "FORBIDDEN", message: "No tienes permisos para configurar seguimiento.", correlationId }, { status: 403, headers: { "X-Correlation-Id": correlationId } });
    const input = inputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return Response.json({ code: "VALIDATION_ERROR", message: "Repartidor, dirección y versión son obligatorios.", correlationId }, { status: 400, headers: { "X-Correlation-Id": correlationId } });
    return Response.json(await updatePickPackTracking(id, input.data), { headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId } });
  } catch (error) {
    const status = error instanceof PickPackRequestError ? error.status : 503;
    const message = error instanceof PickPackRequestError ? error.message : "No fue posible configurar el seguimiento.";
    return Response.json({ code: "LOGISTICS_UNAVAILABLE", message, correlationId }, { status, headers: { "X-Correlation-Id": correlationId } });
  }
}
