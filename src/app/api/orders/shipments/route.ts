import { getCurrentUser } from "@/lib/auth/session.server";
import { CustomerShipmentsRequestError, getCustomerShipmentsFor } from "@/lib/logistics/customer-shipments.server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId = request.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  try {
    const user = await getCurrentUser();
    if (!user) return failure(401, "UNAUTHENTICATED", "Inicia sesión para consultar tus entregas.", correlationId);
    if (user.role !== "CUSTOMER") return failure(403, "FORBIDDEN", "Esta vista está disponible únicamente para cuentas de cliente.", correlationId);

    const shipments = await getCustomerShipmentsFor(user.id);
    return Response.json({ shipments }, {
      headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    if (error instanceof CustomerShipmentsRequestError) return failure(error.status, "SHIPMENTS_UNAVAILABLE", error.message, error.correlationId);
    return failure(503, "SHIPMENTS_UNAVAILABLE", "No fue posible consultar el avance de tus entregas.", correlationId);
  }
}

function failure(status: number, code: string, message: string, correlationId: string) {
  return Response.json({ code, message, correlationId }, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId },
  });
}
