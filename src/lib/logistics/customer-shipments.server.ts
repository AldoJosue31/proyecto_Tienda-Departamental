import "server-only";

import { cookies } from "next/headers";

import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session.server";
import {
  customerShipmentsWireResponseSchema,
  toCustomerShipment,
  type CustomerShipment,
} from "@/lib/logistics/customer-shipments";

export class CustomerShipmentsRequestError extends Error {
  constructor(message: string, readonly status: number, readonly correlationId: string) {
    super(message);
    this.name = "CustomerShipmentsRequestError";
  }
}

export async function getCustomerShipmentsFor(customerId: string): Promise<CustomerShipment[]> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) throw new CustomerShipmentsRequestError("Tu sesión ya no está disponible. Inicia sesión nuevamente.", 401, crypto.randomUUID());

  try {
    const { body, correlationId, response } = await gatewayJson<unknown>("/shipments", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new CustomerShipmentsRequestError(messageFrom(body), response.status, correlationId);

    const parsed = customerShipmentsWireResponseSchema.safeParse(body);
    if (!parsed.success) throw new CustomerShipmentsRequestError("El seguimiento de entregas no tiene un formato válido.", 502, correlationId);

    // Logistics already scopes CUSTOMER reads. Keep this boundary local as well
    // so a malformed upstream response never reaches another customer's UI.
    return parsed.data.shipments
      .filter((shipment) => shipment.customerId === customerId)
      .map(toCustomerShipment);
  } catch (error) {
    if (error instanceof CustomerShipmentsRequestError) throw error;
    if (error instanceof GatewayRequestError) throw new CustomerShipmentsRequestError(error.message, error.status, error.correlationId);
    throw new CustomerShipmentsRequestError("No fue posible consultar el avance de tus entregas.", 503, crypto.randomUUID());
  }
}

function messageFrom(body: unknown) {
  return typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
    ? body.message
    : "No fue posible consultar el avance de tus entregas.";
}
