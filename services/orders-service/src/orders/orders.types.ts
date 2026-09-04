import type { Role } from "../config/environment";

export const ORDER_STATUSES = ["PENDING", "RESERVED", "CONFIRMED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderActor {
  id: string;
  role: Role;
  correlationId: string | null;
}

export interface OrderItem {
  id: string;
  productId: string;
  categoryId: string;
  variantId: string;
  branchId: string;
  productName: string;
  sku: string;
  variantLabel: string;
  quantity: number;
  listUnitPrice: number;
  unitPrice: number;
  lineDiscountTotal: number;
  lineTotal: number;
  currency: string;
  reservationId: string | null;
}

export interface Order {
  id: string;
  branchId: string;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  cancellationReason: string | null;
  cancelledAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface StoredOrder extends Order {
  customerId: string;
  createdBy: string;
  createdByRole: Role;
}

export interface OrderResponse {
  order: Order;
}

export interface CreateOrderSnapshot {
  productId: string;
  categoryId: string;
  variantId: string;
  branchId: string;
  productName: string;
  sku: string;
  variantLabel: string;
  quantity: number;
  listUnitPrice: number;
  unitPrice: number;
  lineDiscountTotal: number;
  lineTotal: number;
  currency: string;
}

export interface IdempotencyRecord {
  actorId: string;
  idempotencyKey: string;
  requestHash: string;
  orderId: string;
  outcomeCode: string | null;
  outcomeMessage: string | null;
}
