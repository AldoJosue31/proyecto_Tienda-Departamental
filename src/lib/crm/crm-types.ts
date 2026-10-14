export interface CrmCustomerSummary {
  name?: string; joinedAt?: string; segmentGroup?: "PURCHASER" | "NEVER_PURCHASED";
  customerId: string;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  completedOrders: number;
  lifetimeTotal: number;
  currency: string;
  updatedAt: string;
}

export interface CrmPurchaseItem {
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  variantLabel: string;
  quantity: number;
  lineTotal: number;
  listUnitPrice?: number; unitPrice?: number; lineDiscountTotal?: number;
}

export interface CrmCustomerProfile {
  historyComplete?: boolean;
  customer: CrmCustomerSummary;
  purchases: Array<{
    orderId: string;
    branchId: string;
    currency: string;
    total: number;
    subtotal?: number; discountTotal?: number; couponCode?: string | null;
    purchasedAt: string;
    items: CrmPurchaseItem[];
  }>;
  lastUpdatedAt: string | null;
}

export interface CrmCustomers { customers: CrmCustomerSummary[]; lastUpdatedAt: string | null; }
export interface InactiveCustomerSegment {
  segment: {
    code: "INACTIVE_CUSTOMERS";
    months: number;
    referenceAt: string;
    cutoffAt: string;
    includesNeverPurchased: true;
    rule: string;
  };
  count: number;
  groups: {purchasers:number;neverPurchased:number};
  customers: CrmCustomerSummary[];
  lastUpdatedAt: string | null;
}

export type CampaignStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "PARTIAL";

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

export interface CampaignResponse {
  campaign: CouponCampaign;
}

export interface CreateCampaignInput {
  months: number;
  couponCode: string;
  validUntil: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  targetScope: "ALL" | "CATEGORY" | "PRODUCT" | "VARIANT";
  targetId?: string;
}
