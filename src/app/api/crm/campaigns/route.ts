import { getCurrentUser } from "@/lib/auth/session.server";
import { createCampaign, CrmRequestError } from "@/lib/crm/crm.server";
import type { CreateCampaignInput } from "@/lib/crm/crm-types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const correlationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ code: "UNAUTHENTICATED", message: "Debes iniciar sesión para continuar.", correlationId }, { status: 401, headers: { "X-Correlation-Id": correlationId } });
    if (user.role !== "ADMIN") return Response.json({ code: "FORBIDDEN", message: "No tienes permisos para crear campañas.", correlationId }, { status: 403, headers: { "X-Correlation-Id": correlationId } });
    const input = await request.json().catch(() => null) as CreateCampaignInput | null;
    if (!input || !Number.isInteger(input.months) || typeof input.couponCode !== "string" || typeof input.validUntil !== "string") {
      return Response.json({ code: "INVALID_REQUEST", message: "La campaña debe incluir segmento, cupón y vigencia.", correlationId }, { status: 400, headers: { "X-Correlation-Id": correlationId } });
    }
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || crypto.randomUUID();
    const result = await createCampaign(input, idempotencyKey);
    return Response.json(result, { status: 202, headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId } });
  } catch (error) {
    const status = error instanceof CrmRequestError ? error.status : 503;
    const message = error instanceof CrmRequestError ? error.message : "No fue posible crear la campaña.";
    return Response.json({ code: "CAMPAIGN_UNAVAILABLE", message, correlationId }, { status, headers: { "X-Correlation-Id": correlationId } });
  }
}
