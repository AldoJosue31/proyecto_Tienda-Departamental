export type PickPackStatus = "PENDING" | "PACKING" | "SHIPPED" | "DELIVERED" | "CANCELLED";

export interface PickPackItem { productId: string; variantId: string; productName: string; sku: string; variantLabel: string; quantity: number; lineTotal: number; }
export interface PickPackShipment {
  id: string; orderId: string; customerId: string; branchId: string; currency: string; total: number; items: PickPackItem[]; status: PickPackStatus; version: number;
  packedAt: string | null; shippedAt: string | null; cancelledAt: string | null; createdAt: string; updatedAt: string;
}
export interface PickPackTransition { id: string; fromStatus: PickPackStatus | null; toStatus: PickPackStatus; actorId: string | null; actorRole: "ADMIN" | "EMPLOYEE" | "CUSTOMER" | null; source: "ORDER_EVENT" | "OPERATIONS" | "SYSTEM"; createdAt: string; }
export interface PickPackDashboard { shipments: PickPackShipment[]; refreshedAt: string; }
export type PickPackTrackingFreshness = "RECENT" | "STALE" | "UNAVAILABLE";
export interface PickPackTracking {
  courier: { id: string; name: string };
  location: { latitude: number; longitude: number; recordedAt: string } | null;
  locationFreshness: PickPackTrackingFreshness;
  deliveryAddress: string;
}
export interface PickPackShipmentDetail { shipment: PickPackShipment; transitions: PickPackTransition[]; tracking?: PickPackTracking; }
export interface PickPackStatusInput { status: "PACKING" | "SHIPPED" | "DELIVERED"; version: number; }
export interface PickPackTrackingInput { courierId: string; courierName: string; deliveryAddress: string; version: number; }
export interface CourierTrackingUpdate { eventId: string; shipmentId: string; courierId: string; location: { latitude: number; longitude: number; recordedAt: string }; }
export interface CourierRoute { available: boolean; reason?: string; durationSeconds?: number; distanceMeters?: number; encodedPolyline?: string; }
