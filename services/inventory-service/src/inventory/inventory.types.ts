export const MOVEMENT_TYPES = [
  "RECEIPT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "PHYSICAL_SALE",
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

export type ReservationStatus = "RESERVED" | "COMMITTED" | "RELEASED" | "EXPIRED";

export interface VariantSnapshot {
  productName: string;
  sku: string;
  variantLabel: string;
}

export interface InventoryStock {
  id: string;
  variantId: string;
  branch: {
    id: string;
    name: string;
  };
  product: VariantSnapshot;
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number | null;
  lastUpdatedAt: string;
}

export interface InventoryListResponse {
  items: InventoryStock[];
}

export interface InventoryReservation {
  id: string;
  orderId: string;
  stock: InventoryStock;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string;
  committedAt: string | null;
  releasedAt: string | null;
}

export interface ReservationResponse {
  reservation: InventoryReservation;
}

export interface MovementResponse {
  movement: {
    id: string;
    type: MovementType;
    quantity: number;
    reason: string | null;
    createdAt: string;
  };
  stock: InventoryStock;
}
