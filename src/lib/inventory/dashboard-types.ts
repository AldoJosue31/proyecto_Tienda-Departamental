export type InventoryDashboardItem = {
  id: string;
  variantId: string;
  branch: {
    id: string;
    name: string;
  };
  product: {
    productName: string;
    sku: string;
    variantLabel: string;
  };
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number | null;
  lastUpdatedAt: string;
};

export type InventoryDashboard = {
  branch: {
    id: string;
    name: string;
  };
  branches: Array<{
    id: string;
    name: string;
  }>;
  generatedAt: string;
  items: InventoryDashboardItem[];
  lowStock: InventoryDashboardItem[];
  summary: {
    onHand: number;
    reserved: number;
    available: number;
    lowStock: number;
    outOfStock: number;
  };
};

export type StockUpdatedEvent = {
  eventId: string;
  occurredAt: string;
  correlationId: string | null;
  variantId: string;
  branchId: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number | null;
  lastUpdatedAt: string;
};
