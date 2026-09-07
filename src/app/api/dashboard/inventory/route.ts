import { getCurrentUser } from "@/lib/auth/session.server";
import { InventoryDashboardRequestError, getInventoryDashboard } from "@/lib/inventory/dashboard.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ code: "UNAUTHENTICATED", message: "Debes iniciar sesión para continuar.", correlationId }, { status: 401, headers: { "X-Correlation-Id": correlationId } });
    if (user.role !== "ADMIN") return Response.json({ code: "FORBIDDEN", message: "No tienes permisos para consultar este dashboard.", correlationId }, { status: 403, headers: { "X-Correlation-Id": correlationId } });

    const branchId = new URL(request.url).searchParams.get("branchId") ?? undefined;
    return Response.json(await getInventoryDashboard(branchId), {
      headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    const status = error instanceof InventoryDashboardRequestError ? error.status : 503;
    const message = error instanceof InventoryDashboardRequestError ? error.message : "No fue posible consultar inventario.";
    return Response.json({ code: "INVENTORY_UNAVAILABLE", message, correlationId }, { status, headers: { "X-Correlation-Id": correlationId } });
  }
}
