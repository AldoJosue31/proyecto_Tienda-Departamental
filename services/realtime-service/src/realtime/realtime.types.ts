export interface StockUpdatedEvent {
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
}

export interface RealtimeEventEnvelope {
  eventId: string;
  eventType: "inventory.stock.changed.v1";
  occurredAt: string;
  correlationId: string | null;
  producer: "inventory-service";
  data: Record<string, unknown>;
}
