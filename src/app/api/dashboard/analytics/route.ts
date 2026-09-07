import { getCurrentUser } from "@/lib/auth/session.server";
import { AnalyticsDashboardRequestError, getAnalyticsDashboard } from "@/lib/analytics/dashboard.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ code: "UNAUTHENTICATED", message: "Debes iniciar sesión para continuar.", correlationId }, { status: 401, headers: { "X-Correlation-Id": correlationId } });
    if (user.role !== "ADMIN") return Response.json({ code: "FORBIDDEN", message: "No tienes permisos para consultar Analytics.", correlationId }, { status: 403, headers: { "X-Correlation-Id": correlationId } });
    const url = new URL(request.url);
    return Response.json(await getAnalyticsDashboard(url.searchParams.get("period") ?? undefined, url.searchParams.get("limit") ?? undefined), { headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId } });
  } catch (error) {
    const status = error instanceof AnalyticsDashboardRequestError ? error.status : 503;
    const message = error instanceof AnalyticsDashboardRequestError ? error.message : "No fue posible consultar Analytics.";
    return Response.json({ code: "ANALYTICS_UNAVAILABLE", message, correlationId }, { status, headers: { "X-Correlation-Id": correlationId } });
  }
}
