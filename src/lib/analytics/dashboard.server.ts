import "server-only";

import { cookies } from "next/headers";
import { z } from "zod";
import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session.server";
import type { AnalyticsDashboard, AnalyticsPeriod } from "./dashboard-types";

const periodSchema = z.enum(["today", "7d", "30d"]);
const branchSchema = z.object({ branchId: z.string().uuid(), branchName: z.string().min(1), sales: z.number().nonnegative(), completedOrders: z.number().int().nonnegative() });
const productSchema = z.object({ productId: z.string().uuid(), variantId: z.string().uuid(), productName: z.string().min(1), unitsSold: z.number().int().positive(), sales: z.number().nonnegative() });
const inventorySchema = z.object({ branchId: z.string().uuid(), branchName: z.string().min(1), onHand: z.number().int().nonnegative(), reserved: z.number().int().nonnegative(), available: z.number().int().nonnegative() });
const syncedSchema = z.object({ lastUpdatedAt: z.string().datetime().nullable() });
const salesTodaySchema = syncedSchema.extend({ currency: z.string().length(3), sales: z.number().nonnegative(), completedOrders: z.number().int().nonnegative() });
const ticketAverageSchema = syncedSchema.extend({ currency: z.string().length(3), ticketAverage: z.number().nonnegative(), completedOrders: z.number().int().nonnegative(), formula: z.string().min(1), period: z.object({ code: periodSchema }) });
const salesByBranchSchema = syncedSchema.extend({ currency: z.string().length(3), period: z.object({ code: periodSchema }), branches: z.array(branchSchema) });
const topProductsSchema = syncedSchema.extend({ currency: z.string().length(3), period: z.object({ code: periodSchema }), limit: z.union([z.literal(5), z.literal(10), z.literal(20)]), products: z.array(productSchema) });
const inventoryByBranchSchema = syncedSchema.extend({ branches: z.array(inventorySchema) });

export class AnalyticsDashboardRequestError extends Error {
  constructor(message: string, readonly status: number, readonly correlationId: string) { super(message); this.name = "AnalyticsDashboardRequestError"; }
}

function normalizedPeriod(value?: string): AnalyticsPeriod { return periodSchema.safeParse(value).success ? value as AnalyticsPeriod : "today"; }
function normalizedLimit(value?: string): 5 | 10 | 20 { return value === "10" ? 10 : value === "20" ? 20 : 5; }

async function request<T>(path: string, schema: z.ZodType<T>, token: string): Promise<T> {
  try {
    const { body, correlationId, response } = await gatewayJson<unknown>(path, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new AnalyticsDashboardRequestError("No fue posible obtener los reportes de Analytics.", response.status, correlationId);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new AnalyticsDashboardRequestError("Analytics devolvió un contrato inválido.", 502, correlationId);
    return parsed.data;
  } catch (error) {
    if (error instanceof AnalyticsDashboardRequestError) throw error;
    if (error instanceof GatewayRequestError) throw new AnalyticsDashboardRequestError("No fue posible contactar al API Gateway.", error.status, error.correlationId);
    throw new AnalyticsDashboardRequestError("No fue posible obtener los reportes de Analytics.", 503, crypto.randomUUID());
  }
}

export async function getAnalyticsDashboard(periodValue?: string, limitValue?: string): Promise<AnalyticsDashboard> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) throw new AnalyticsDashboardRequestError("Debes iniciar sesión para consultar Analytics.", 401, crypto.randomUUID());
  const period = normalizedPeriod(periodValue); const limit = normalizedLimit(limitValue);
  const params = new URLSearchParams({ period });
  const [salesToday, ticketAverage, salesByBranch, topProducts, inventoryByBranch] = await Promise.all([
    request("/analytics/sales/today", salesTodaySchema, token),
    request(`/analytics/ticket-average?${params}`, ticketAverageSchema, token),
    request(`/analytics/sales/by-branch?${params}`, salesByBranchSchema, token),
    request(`/analytics/products/top?${new URLSearchParams({ period, limit: String(limit) })}`, topProductsSchema, token),
    request("/analytics/inventory/by-branch", inventoryByBranchSchema, token),
  ]);
  return {
    salesToday,
    ticketAverage: { ...ticketAverage, period: ticketAverage.period.code },
    salesByBranch: { ...salesByBranch, period: salesByBranch.period.code },
    topProducts: { ...topProducts, period: topProducts.period.code },
    inventoryByBranch,
  };
}
