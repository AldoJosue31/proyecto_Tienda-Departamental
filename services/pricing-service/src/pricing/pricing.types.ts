export const PROMOTION_STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE", "EXPIRED"] as const;
export const DISCOUNT_TYPES = ["PERCENTAGE", "FIXED"] as const;
export const TARGET_SCOPES = ["ALL", "PRODUCT", "CATEGORY", "VARIANT"] as const;

export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];
export type DiscountType = (typeof DISCOUNT_TYPES)[number];
export type TargetScope = (typeof TARGET_SCOPES)[number];

export interface PromotionTarget {
  scope: TargetScope;
  targetId: string | null;
}

export interface Promotion {
  id: string;
  name: string;
  status: PromotionStatus;
  discountType: DiscountType;
  discountValue: number;
  priority: number;
  startsAt: string;
  endsAt: string;
  timezone: string;
  targets: PromotionTarget[];
  createdAt: string;
  updatedAt: string;
}

export interface Quote {
  variantId: string;
  basePrice: number;
  effectivePrice: number;
  currency: string;
  discountAmount: number;
  discountPercentage: number;
  appliedPromotion: Pick<Promotion, "id" | "name" | "priority"> | null;
  quotedAt: string;
}
