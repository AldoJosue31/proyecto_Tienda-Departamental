import { getCurrentUser } from "@/lib/auth/session.server";
import { CrmRequestError, getCrmCustomers } from "@/lib/crm/crm.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ code: "UNAUTHENTICATED", message: "Debes iniciar sesión para continuar.", correlationId }, { status: 401, headers: { "X-Correlation-Id": correlationId } });
    if (user.role !== "ADMIN") return Response.json({ code: "FORBIDDEN", message: "No tienes permisos para consultar CRM.", correlationId }, { status: 403, headers: { "X-Correlation-Id": correlationId } });
    return Response.json(await getCrmCustomers(), { headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId } });
  } catch (error) {
    const status = error instanceof CrmRequestError ? error.status : 503;
    const message = error instanceof CrmRequestError ? error.message : "No fue posible consultar CRM.";
    return Response.json({ code: "CRM_UNAVAILABLE", message, correlationId }, { status, headers: { "X-Correlation-Id": correlationId } });
  }
}
