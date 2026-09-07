import { getCurrentUser } from "@/lib/auth/session.server";
import { getPickPackDashboard, PickPackRequestError } from "@/lib/logistics/pick-pack.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ code: "UNAUTHENTICATED", message: "Debes iniciar sesión para continuar.", correlationId }, { status: 401, headers: { "X-Correlation-Id": correlationId } });
    if (user.role !== "ADMIN" && user.role !== "EMPLOYEE") return Response.json({ code: "FORBIDDEN", message: "No tienes permisos para consultar operación.", correlationId }, { status: 403, headers: { "X-Correlation-Id": correlationId } });
    return Response.json(await getPickPackDashboard(), { headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId } });
  } catch (error) {
    const status = error instanceof PickPackRequestError ? error.status : 503; const message = error instanceof PickPackRequestError ? error.message : "No fue posible consultar Logistics.";
    return Response.json({ code: "LOGISTICS_UNAVAILABLE", message, correlationId }, { status, headers: { "X-Correlation-Id": correlationId } });
  }
}
