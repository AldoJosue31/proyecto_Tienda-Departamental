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

export interface CourierLocationUpdatedEvent {
  eventId: string;
  occurredAt: string;
  correlationId: string | null;
  shipmentId: string;
  courierId: string;
  location: {
    latitude: number;
    longitude: number;
    recordedAt: string;
  };
}

export interface CourierTrackingEnvelope {
  eventId: string;
  eventType: "shipment.tracking.updated.v1";
  occurredAt: string;
  correlationId: string | null;
  producer: "logistics-service";
  data: Record<string, unknown>;
}
