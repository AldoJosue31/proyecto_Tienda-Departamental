import "server-only";

import { cookies } from "next/headers";

import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session.server";
import {
  customerOrderResponseSchema,
  customerOrdersResponseSchema,
  type CustomerOrder,
} from "@/lib/orders/customer-orders";

export class CustomerOrdersRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "CustomerOrdersRequestError";
  }
}

export async function getCustomerOrders(): Promise<CustomerOrder[]> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) throw new CustomerOrdersRequestError("Tu sesión ya no está disponible.", 401);

  const { body, correlationId, response } = await gatewayJson<unknown>("/orders/mine", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new CustomerOrdersRequestError("No fue posible cargar tus pedidos.", response.status);
  }
  const parsed = customerOrdersResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new GatewayRequestError("Orders devolvió un historial inválido.", 502, correlationId);
  }
  return parsed.data.orders;
}

export async function getCustomerOrder(orderId: string): Promise<CustomerOrder> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) throw new CustomerOrdersRequestError("Tu sesión ya no está disponible.", 401);

  const { body, correlationId, response } = await gatewayJson<unknown>(`/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new CustomerOrdersRequestError("No fue posible cargar este pedido.", response.status);
  }
  const parsed = customerOrderResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new GatewayRequestError("Orders devolvió el detalle de pedido inválido.", 502, correlationId);
  }
  return parsed.data.order;
}
