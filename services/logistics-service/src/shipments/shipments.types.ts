import type { Role } from "../config/environment";

export const SHIPMENT_STATUSES = ["PENDING", "PACKING", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
export interface ShipmentItem { productId: string; variantId: string; productName: string; sku: string; variantLabel: string; quantity: number; lineTotal: number; }
export interface Shipment {
  id: string; orderId: string; customerId: string; branchId: string; currency: string; total: number; items: ShipmentItem[];
  status: ShipmentStatus; version: number; packedAt: string | null; shippedAt: string | null; cancelledAt: string | null; createdAt: string; updatedAt: string;
}
export interface ShipmentTransition { id: string; fromStatus: ShipmentStatus | null; toStatus: ShipmentStatus; actorId: string | null; actorRole: Role | null; source: "ORDER_EVENT" | "OPERATIONS" | "SYSTEM"; createdAt: string; }
export interface ShipmentDetailResponse { shipment: Shipment; transitions: ShipmentTransition[]; }
export interface ShipmentListResponse { shipments: Shipment[]; refreshedAt: string; }
export interface ShipmentStatusRequest { status: string; version: unknown; }
export interface ShipmentActor { id: string; role: Extract<Role, "ADMIN" | "EMPLOYEE">; correlationId: string | null; }

export type LogisticsEvent = CompletedOrderEvent | CancelledOrderEvent;
export interface CompletedOrderEvent {
  eventId: string; eventType: "order.completed.v1"; occurredAt: string; correlationId: string | null; orderId: string; customerId: string; branchId: string; currency: string; total: number; items: ShipmentItem[];
}
export interface CancelledOrderEvent { eventId: string; eventType: "order.cancelled.v1"; occurredAt: string; correlationId: string | null; orderId: string; }
