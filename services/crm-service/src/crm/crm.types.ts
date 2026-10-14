export interface PurchaseItemSnapshot {
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  variantLabel: string;
  quantity: number;
  lineTotal: number;
}

export interface CompletedOrderEvent {
  eventId: string;
  eventType: "order.completed.v1";
  occurredAt: string;
  correlationId: string | null;
  orderId: string;
  customerId: string;
  branchId: string;
  currency: string;
  total: number;
  items: PurchaseItemSnapshot[];
}

export interface CancelledOrderEvent {
  eventId: string;
  eventType: "order.cancelled.v1";
  occurredAt: string;
  correlationId: string | null;
  orderId: string;
}

export type CrmEvent = CompletedOrderEvent | CancelledOrderEvent;

export interface CustomerSummary {
  name?: string;
  joinedAt?: string;
  segmentGroup?: "PURCHASER" | "NEVER_PURCHASED";
  customerId: string;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  completedOrders: number;
  lifetimeTotal: number;
  currency: string;
  updatedAt: string;
}

export interface CustomerPurchase {
  subtotal?: number;
  discountTotal?: number;
  couponCode?: string | null;
  orderId: string;
  branchId: string;
  currency: string;
  total: number;
  purchasedAt: string;
  items: PurchaseItemSnapshot[];
}

export interface CustomerProfileResponse {
  historyComplete?: boolean;
  customer: CustomerSummary;
  purchases: CustomerPurchase[];
  lastUpdatedAt: string | null;
}

export interface CustomersResponse { customers: CustomerSummary[]; lastUpdatedAt: string | null; }
export interface InactiveSegmentResponse {
  segment: {
    code: "INACTIVE_CUSTOMERS";
    months: number;
    referenceAt: string;
    cutoffAt: string;
    includesNeverPurchased: true;
    rule: string;
  };
  count: number;
  groups: { purchasers: number; neverPurchased: number };
  customers: CustomerSummary[];
  lastUpdatedAt: string | null;
}

export type CampaignRecipientStatus = "PENDING" | "SENT" | "SIMULATED" | "UNKNOWN" | "FAILED" | "UNDELIVERABLE";
export type CampaignStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "PARTIAL";

export interface CouponCampaignInput {
  months?: unknown;
  couponCode?: unknown;
  validUntil?: unknown;
  discountType?: unknown;
  discountValue?: unknown;
  targetScope?: unknown;
  targetId?: unknown;
}

export interface CouponCampaign {
  referenceAt?: string | null; cutoffAt?: string | null;
  id: string;
  segmentMonths: number;
  couponCode: string;
  validUntil: string;
  targetCount: number;
  pendingCount: number;
  sentCount: number;
  simulatedCount: number;
  unknownCount: number;
  failedCount: number;
  undeliverableCount: number;
  status: CampaignStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignResponse { campaign: CouponCampaign; }

export interface NotificationDeliveryEvent {
  eventId: string;
  eventType: "notification.sent.v1" | "notification.simulated.v1" | "notification.failed.v1";
  occurredAt: string;
  correlationId: string | null;
  campaignId: string;
  customerId: string;
  notificationId: string;
  failureCode?: "DELIVERY_FAILED" | "UNDELIVERABLE" | "COUPON_EXPIRED";
  deliveryMode?: "smtp" | "log";
  willRetry?: boolean;
  attempt?:number;
}
