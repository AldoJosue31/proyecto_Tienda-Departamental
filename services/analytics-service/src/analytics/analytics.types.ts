export type AnalyticsPeriod = "today" | "7d" | "30d";

export interface EventBase { eventId: string; occurredAt: string; correlationId: string | null; }
export interface CompletedOrderEvent extends EventBase {
  eventType: "order.completed.v1";
  branchId: string; orderId: string; currency: string; total: number;
  items: Array<{ productId: string; variantId: string; productName: string; quantity: number; lineTotal: number }>;
}
export interface CancelledOrderEvent extends EventBase { eventType: "order.cancelled.v1"; orderId: string; }
export interface StockChangedEvent extends EventBase {
  eventType: "inventory.stock.changed.v1";
  branchId: string; branchName?: string; variantId: string; onHand: number; reserved: number; available: number; lastUpdatedAt: string;
}
export type AnalyticsEvent = CompletedOrderEvent | CancelledOrderEvent | StockChangedEvent;

export interface AnalyticsPeriodResponse { code: AnalyticsPeriod; timezone: string; }
export interface SalesByBranchResponse {
  period: AnalyticsPeriodResponse; currency: string;
  branches: Array<{ branchId: string; branchName: string; sales: number; completedOrders: number }>;
  lastUpdatedAt: string | null;
}
export interface SalesTodayResponse { period: AnalyticsPeriodResponse; currency: string; sales: number; completedOrders: number; lastUpdatedAt: string | null; }
export interface TicketAverageResponse { period: AnalyticsPeriodResponse; currency: string; ticketAverage: number; completedOrders: number; formula: string; lastUpdatedAt: string | null; }
export interface TopProductsResponse {
  period: AnalyticsPeriodResponse; currency: string; limit: number;
  products: Array<{ productId: string; variantId: string; productName: string; unitsSold: number; sales: number }>;
  lastUpdatedAt: string | null;
}
export interface InventoryByBranchResponse {
  branches: Array<{ branchId: string; branchName: string; onHand: number; reserved: number; available: number }>;
  lastUpdatedAt: string | null;
}
