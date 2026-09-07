import { getCurrentUser } from "@/lib/auth/session.server";
import { CrmRequestError, getCampaign } from "@/lib/crm/crm.server";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const correlationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ code: "UNAUTHENTICATED", message: "Debes iniciar sesión para continuar.", correlationId }, { status: 401, headers: { "X-Correlation-Id": correlationId } });
    if (user.role !== "ADMIN") return Response.json({ code: "FORBIDDEN", message: "No tienes permisos para consultar campañas.", correlationId }, { status: 403, headers: { "X-Correlation-Id": correlationId } });
    const { id } = await context.params;
    return Response.json(await getCampaign(id), { headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId } });
  } catch (error) {
    const status = error instanceof CrmRequestError ? error.status : 503;
    const message = error instanceof CrmRequestError ? error.message : "No fue posible consultar la campaña.";
    return Response.json({ code: "CAMPAIGN_UNAVAILABLE", message, correlationId }, { status, headers: { "X-Correlation-Id": correlationId } });
  }
}
