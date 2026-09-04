import "server-only";

import { cookies } from "next/headers";
import { z } from "zod";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session.server";
import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";
import type { PickPackDashboard, PickPackShipmentDetail, PickPackStatusInput } from "./pick-pack-types";

const statusSchema = z.enum(["PENDING", "PACKING", "SHIPPED", "DELIVERED", "CANCELLED"]);
const itemSchema = z.object({ productId: z.string().uuid(), variantId: z.string().uuid(), productName: z.string().min(1), sku: z.string().min(1), variantLabel: z.string().min(1), quantity: z.number().int().positive(), lineTotal: z.number().nonnegative() });
const shipmentSchema = z.object({ id: z.string().uuid(), orderId: z.string().uuid(), customerId: z.string().uuid(), branchId: z.string().uuid(), currency: z.string().length(3), total: z.number().nonnegative(), items: z.array(itemSchema), status: statusSchema, version: z.number().int().positive(), packedAt: z.string().datetime().nullable(), shippedAt: z.string().datetime().nullable(), cancelledAt: z.string().datetime().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
const transitionSchema = z.object({ id: z.string().uuid(), fromStatus: statusSchema.nullable(), toStatus: statusSchema, actorId: z.string().uuid().nullable(), actorRole: z.enum(["ADMIN", "EMPLOYEE", "CUSTOMER"]).nullable(), source: z.enum(["ORDER_EVENT", "OPERATIONS", "SYSTEM"]), createdAt: z.string().datetime() });
const dashboardSchema = z.object({ shipments: z.array(shipmentSchema), refreshedAt: z.string().datetime() });
const detailSchema = z.object({ shipment: shipmentSchema, transitions: z.array(transitionSchema) });

export class PickPackRequestError extends Error {
  constructor(message: string, readonly status: number, readonly correlationId: string) { super(message); this.name = "PickPackRequestError"; }
}

async function token(): Promise<string> { const value = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value; if (!value) throw new PickPackRequestError("Debes iniciar sesión para consultar operación.", 401, crypto.randomUUID()); return value; }
async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  try {
    const headers = new Headers(init?.headers); headers.set("Authorization", `Bearer ${await token()}`);
    const { body, correlationId, response } = await gatewayJson<unknown>(path, { ...init, headers });
    if (!response.ok) throw new PickPackRequestError("No fue posible consultar Logistics.", response.status, correlationId);
    const parsed = schema.safeParse(body); if (!parsed.success) throw new PickPackRequestError("Logistics devolvió un contrato inválido.", 502, correlationId); return parsed.data;
  } catch (error) {
    if (error instanceof PickPackRequestError) throw error;
    if (error instanceof GatewayRequestError) throw new PickPackRequestError("No fue posible contactar al API Gateway.", error.status, error.correlationId);
    throw new PickPackRequestError("No fue posible consultar Logistics.", 503, crypto.randomUUID());
  }
}

export function getPickPackDashboard(): Promise<PickPackDashboard> { return request("/shipments", dashboardSchema); }
export function getPickPackShipment(id: string): Promise<PickPackShipmentDetail> { return request(`/shipments/${encodeURIComponent(id)}`, detailSchema); }
export function updatePickPackShipment(id: string, input: PickPackStatusInput): Promise<PickPackShipmentDetail> { return request(`/shipments/${encodeURIComponent(id)}/status`, detailSchema, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }); }
