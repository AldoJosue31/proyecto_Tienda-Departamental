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
  customerId: string;
  firstPurchaseAt: string;
  lastPurchaseAt: string;
  completedOrders: number;
  lifetimeTotal: number;
  currency: string;
  updatedAt: string;
}

export interface CustomerPurchase {
  orderId: string;
  branchId: string;
  currency: string;
  total: number;
  purchasedAt: string;
  items: PurchaseItemSnapshot[];
}

export interface CustomerProfileResponse {
  customer: CustomerSummary;
  purchases: CustomerPurchase[];
  lastUpdatedAt: string | null;
}

export interface CustomersResponse { customers: CustomerSummary[]; lastUpdatedAt: string | null; }
export interface InactiveSegmentResponse {
  segment: {
    code: "INACTIVE_PURCHASERS";
    months: number;
    referenceAt: string;
    cutoffAt: string;
    includesNeverPurchased: false;
    rule: string;
  };
  count: number;
  customers: CustomerSummary[];
  lastUpdatedAt: string | null;
}

export type CampaignRecipientStatus = "PENDING" | "SENT" | "FAILED" | "UNDELIVERABLE";
export type CampaignStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "PARTIAL";

export interface CouponCampaignInput {
  months?: unknown;
  couponCode?: unknown;
  validUntil?: unknown;
}

export interface CouponCampaign {
  id: string;
  segmentMonths: number;
  couponCode: string;
  validUntil: string;
  targetCount: number;
  pendingCount: number;
  sentCount: number;
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
  eventType: "notification.sent.v1" | "notification.failed.v1";
  occurredAt: string;
  correlationId: string | null;
  campaignId: string;
  customerId: string;
  notificationId: string;
  failureCode?: "DELIVERY_FAILED" | "UNDELIVERABLE";
}
