import "server-only";

import { cookies } from "next/headers";
import { z } from "zod";

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session.server";
import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";
import type { CampaignResponse, CreateCampaignInput, CrmCustomerProfile, CrmCustomers, InactiveCustomerSegment } from "./crm-types";

const customerSchema = z.object({
  customerId: z.string().uuid(), firstPurchaseAt: z.string().datetime(), lastPurchaseAt: z.string().datetime(), completedOrders: z.number().int().positive(),
  lifetimeTotal: z.number().nonnegative(), currency: z.string().length(3), updatedAt: z.string().datetime(),
});
const purchaseItemSchema = z.object({ productId: z.string().uuid(), variantId: z.string().uuid(), productName: z.string().min(1), sku: z.string().min(1), variantLabel: z.string().min(1), quantity: z.number().int().positive(), lineTotal: z.number().nonnegative() });
const customerProfileSchema = z.object({ customer: customerSchema, purchases: z.array(z.object({ orderId: z.string().uuid(), branchId: z.string().uuid(), currency: z.string().length(3), total: z.number().nonnegative(), purchasedAt: z.string().datetime(), items: z.array(purchaseItemSchema) })), lastUpdatedAt: z.string().datetime().nullable() });
const customersSchema = z.object({ customers: z.array(customerSchema), lastUpdatedAt: z.string().datetime().nullable() });
const inactiveSegmentSchema = z.object({ segment: z.object({ code: z.literal("INACTIVE_PURCHASERS"), months: z.number().int().positive(), referenceAt: z.string().datetime(), cutoffAt: z.string().datetime(), includesNeverPurchased: z.literal(false), rule: z.string().min(1) }), count: z.number().int().nonnegative(), customers: z.array(customerSchema), lastUpdatedAt: z.string().datetime().nullable() });
const campaignSchema = z.object({
  id: z.string().uuid(), segmentMonths: z.number().int().positive(), couponCode: z.string().min(1), validUntil: z.string().datetime(), targetCount: z.number().int().nonnegative(), pendingCount: z.number().int().nonnegative(), sentCount: z.number().int().nonnegative(), failedCount: z.number().int().nonnegative(), undeliverableCount: z.number().int().nonnegative(), status: z.enum(["QUEUED", "PROCESSING", "COMPLETED", "PARTIAL"]), createdBy: z.string().uuid(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
const campaignResponseSchema = z.object({ campaign: campaignSchema });

export class CrmRequestError extends Error { constructor(message: string, readonly status: number, readonly correlationId: string) { super(message); this.name = "CrmRequestError"; } }

async function token(): Promise<string> { const value = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value; if (!value) throw new CrmRequestError("Debes iniciar sesión para consultar CRM.", 401, crypto.randomUUID()); return value; }
async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  try {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await token()}`);
    const { body, correlationId, response } = await gatewayJson<unknown>(path, { ...init, headers });
    if (!response.ok) throw new CrmRequestError("No fue posible completar la operación de CRM.", response.status, correlationId);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new CrmRequestError("CRM devolvió un contrato inválido.", 502, correlationId);
    return parsed.data;
  } catch (error) {
    if (error instanceof CrmRequestError) throw error;
    if (error instanceof GatewayRequestError) throw new CrmRequestError("No fue posible contactar al API Gateway.", error.status, error.correlationId);
    throw new CrmRequestError("No fue posible consultar CRM.", 503, crypto.randomUUID());
  }
}

export function getCrmCustomers(): Promise<CrmCustomers> { return request("/customers", customersSchema); }
export function getCrmCustomer(customerId: string): Promise<CrmCustomerProfile> { return request(`/customers/${encodeURIComponent(customerId)}`, customerProfileSchema); }
export function getInactiveCustomers(months = 3): Promise<InactiveCustomerSegment> { return request(`/segments/inactive?${new URLSearchParams({ months: String(months) })}`, inactiveSegmentSchema); }
export function getCampaign(campaignId: string): Promise<CampaignResponse> { return request(`/campaigns/${encodeURIComponent(campaignId)}`, campaignResponseSchema); }
export function createCampaign(input: CreateCampaignInput, idempotencyKey: string): Promise<CampaignResponse> {
  return request("/campaigns", campaignResponseSchema, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(input) });
}
