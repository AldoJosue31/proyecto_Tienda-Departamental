export interface CrmCustomerSummary {
  customerId: string;
  firstPurchaseAt: string;
  lastPurchaseAt: string;
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
}

export interface CrmCustomerProfile {
  customer: CrmCustomerSummary;
  purchases: Array<{
    orderId: string;
    branchId: string;
    currency: string;
    total: number;
    purchasedAt: string;
    items: CrmPurchaseItem[];
  }>;
  lastUpdatedAt: string | null;
}

export interface CrmCustomers { customers: CrmCustomerSummary[]; lastUpdatedAt: string | null; }
export interface InactiveCustomerSegment {
  segment: {
    code: "INACTIVE_PURCHASERS";
    months: number;
    referenceAt: string;
    cutoffAt: string;
    includesNeverPurchased: false;
    rule: string;
  };
  count: number;
  customers: CrmCustomerSummary[];
  lastUpdatedAt: string | null;
}

export type CampaignStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "PARTIAL";

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

export interface CampaignResponse {
  campaign: CouponCampaign;
}

export interface CreateCampaignInput {
  months: number;
  couponCode: string;
  validUntil: string;
}
