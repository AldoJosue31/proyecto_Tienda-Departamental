export type PickPackStatus = "PENDING" | "PACKING" | "SHIPPED" | "DELIVERED" | "CANCELLED";

export interface PickPackItem { productId: string; variantId: string; productName: string; sku: string; variantLabel: string; quantity: number; lineTotal: number; }
export interface PickPackShipment {
  id: string; orderId: string; customerId: string; branchId: string; currency: string; total: number; items: PickPackItem[]; status: PickPackStatus; version: number;
  packedAt: string | null; shippedAt: string | null; cancelledAt: string | null; createdAt: string; updatedAt: string;
}
export interface PickPackTransition { id: string; fromStatus: PickPackStatus | null; toStatus: PickPackStatus; actorId: string | null; actorRole: "ADMIN" | "EMPLOYEE" | "CUSTOMER" | null; source: "ORDER_EVENT" | "OPERATIONS" | "SYSTEM"; createdAt: string; }
export interface PickPackDashboard { shipments: PickPackShipment[]; refreshedAt: string; }
export interface PickPackShipmentDetail { shipment: PickPackShipment; transitions: PickPackTransition[]; }
export interface PickPackStatusInput { status: "PACKING" | "SHIPPED"; version: number; }
