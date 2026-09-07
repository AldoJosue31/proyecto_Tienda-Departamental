export type BranchId = "centro" | "norte" | "sur";

export type Branch = {
  id: BranchId;
  name: string;
  city: string;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  tags: string[];
  tone: "teal" | "orange" | "blue" | "pink" | "lime" | "slate";
  variant: {
    id: string;
    sku: string;
    label: string;
    listPrice: number;
    currency: "MXN";
  };
};

export type InventoryRecord = {
  variantId: string;
  branchId: BranchId;
  onHand: number;
  reservedQuantity: number;
  lowStockThreshold: number;
};

export type RuleTarget = {
  type: "product" | "category" | "variant";
  id: string;
};

export type PriceRule = {
  id: string;
  name: string;
  status: "PUBLISHED" | "DRAFT" | "DISABLED";
  priority: number;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  startsAt?: string;
  endsAt?: string;
  dailyWindow?: {
    start: string;
    end: string;
    timeZone: string;
  };
  targets: RuleTarget[];
};

export type ProductCard = Product & {
  finalPrice: number;
  discountPercentage: number;
  appliedRule?: Pick<PriceRule, "id" | "name">;
  availableQuantity: number;
};

export type CheckoutLineInput = {
  variantId: string;
  branchId: BranchId;
  quantity: number;
};

export type CheckoutInput = {
  idempotencyKey: string;
  customerId: string;
  lines: CheckoutLineInput[];
};

export type CheckoutResult = {
  checkoutId: string;
  status: "CONFIRMED" | "OUT_OF_STOCK";
  orderNumber?: string;
  message: string;
  unavailableLines?: CheckoutLineInput[];
};

export type InventoryDashboard = {
  branch: Branch;
  generatedAt: string;
  categories: Array<{
    category: string;
    available: number;
    reserved: number;
  }>;
  stockDistribution: Array<{
    label: string;
    value: number;
  }>;
  lowStock: Array<{
    productName: string;
    variantLabel: string;
    available: number;
    threshold: number;
  }>;
};
