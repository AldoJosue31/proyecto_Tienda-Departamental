import "server-only";

import { cookies } from "next/headers";
import { z } from "zod";

import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session.server";
import type { InventoryDashboard, InventoryDashboardItem } from "@/lib/inventory/dashboard-types";

const stockSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
  branch: z.object({ id: z.string().uuid(), name: z.string().min(1) }),
  product: z.object({
    productName: z.string().min(1),
    sku: z.string().min(1),
    variantLabel: z.string().min(1),
  }),
  onHand: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
  reorderPoint: z.number().int().nonnegative().nullable(),
  lastUpdatedAt: z.string().datetime(),
});

const listSchema = z.object({ items: z.array(stockSchema) });

export class InventoryDashboardRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly correlationId: string,
  ) {
    super(message);
    this.name = "InventoryDashboardRequestError";
  }
}

function branchOptions(items: InventoryDashboardItem[]) {
  const byId = new Map(items.map((item) => [item.branch.id, item.branch]));
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name, "es"));
}

function dashboardFromItems(items: InventoryDashboardItem[], requestedBranchId?: string): InventoryDashboard {
  const branches = branchOptions(items);
  const branch = branches.find((item) => item.id === requestedBranchId) ?? branches[0];
  if (!branch) {
    throw new InventoryDashboardRequestError("No hay sucursales de inventario disponibles.", 502, crypto.randomUUID());
  }
  const branchItems = items.filter((item) => item.branch.id === branch.id)
    .sort((left, right) => left.product.productName.localeCompare(right.product.productName, "es") || left.product.sku.localeCompare(right.product.sku));
  const lowStock = branchItems.filter((item) => item.reorderPoint !== null && item.available <= item.reorderPoint)
    .sort((left, right) => left.available - right.available || left.product.productName.localeCompare(right.product.productName, "es"));

  return {
    branch,
    branches,
    generatedAt: new Date().toISOString(),
    items: branchItems,
    lowStock,
    summary: {
      onHand: branchItems.reduce((total, item) => total + item.onHand, 0),
      reserved: branchItems.reduce((total, item) => total + item.reserved, 0),
      available: branchItems.reduce((total, item) => total + item.available, 0),
      lowStock: lowStock.length,
      outOfStock: branchItems.filter((item) => item.available === 0).length,
    },
  };
}

export async function getInventoryDashboard(branchId?: string): Promise<InventoryDashboard> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    throw new InventoryDashboardRequestError("Debes iniciar sesión para consultar inventario.", 401, crypto.randomUUID());
  }
  const requested = branchId && z.string().uuid().safeParse(branchId).success ? branchId : undefined;

  try {
    const { body, correlationId, response } = await gatewayJson<unknown>("/inventory", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new InventoryDashboardRequestError("No fue posible obtener el inventario actualizado.", response.status, correlationId);
    }
    const parsed = listSchema.safeParse(body);
    if (!parsed.success) {
      throw new InventoryDashboardRequestError("Inventory devolvió un contrato inválido.", 502, correlationId);
    }
    return dashboardFromItems(parsed.data.items, requested);
  } catch (error) {
    if (error instanceof InventoryDashboardRequestError) throw error;
    if (error instanceof GatewayRequestError) {
      throw new InventoryDashboardRequestError("No fue posible contactar al API Gateway.", error.status, error.correlationId);
    }
    throw new InventoryDashboardRequestError("No fue posible obtener el inventario actualizado.", 503, crypto.randomUUID());
  }
}
