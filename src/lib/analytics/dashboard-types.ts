export type AnalyticsPeriod = "today" | "7d" | "30d";

export interface AnalyticsDashboard {
  salesToday: { sales: number; completedOrders: number; currency: string; lastUpdatedAt: string | null };
  ticketAverage: { ticketAverage: number; completedOrders: number; currency: string; period: AnalyticsPeriod; formula: string; lastUpdatedAt: string | null };
  salesByBranch: { period: AnalyticsPeriod; currency: string; branches: Array<{ branchId: string; branchName: string; sales: number; completedOrders: number }>; lastUpdatedAt: string | null };
  topProducts: { period: AnalyticsPeriod; currency: string; limit: 5 | 10 | 20; products: Array<{ productId: string; productName: string; unitsSold: number; sales: number }>; lastUpdatedAt: string | null };
  inventoryByBranch: { synchronization: { complete: boolean; completedAt: string | null; importedRows: number; expectedRows: number; retryPending: boolean }; branches: Array<{ branchId: string; branchName: string; onHand: number; reserved: number; available: number }>; lastUpdatedAt: string | null };
}
