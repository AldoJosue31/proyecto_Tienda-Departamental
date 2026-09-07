import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(webRoot, relativePath), "utf8");

describe("eventos confiables de la fase 6", () => {
  it("aísla RabbitMQ en una red interna y conecta los productores actuales", () => {
    const compose = read("compose.yaml");

    expect(compose).toContain("rabbitmq:4-management-alpine");
    expect(compose).toContain("events-internal:");
    expect(compose).toContain("RABBITMQ_URL");
    expect(compose).toContain("OUTBOX_PUBLISH_INTERVAL_MILLISECONDS");
    expect(compose).toMatch(/rabbitmq:[\s\S]*?networks:\s*\n\s*- events-internal/);
  });

  it("persiste los eventos de cada propietario y publica envelopes versionados", () => {
    const ordersMigration = read("services/orders-service/migrations/002_outbox.sql");
    const inventoryMigration = read("services/inventory-service/migrations/002_events_outbox.sql");
    const pricingMigration = read("services/pricing-service/migrations/002_outbox.sql");
    const ordersOutbox = read("services/orders-service/src/events/outbox.service.ts");

    expect(ordersMigration).toContain("orders_outbox_events");
    expect(inventoryMigration).toContain("inventory_outbox_events");
    expect(pricingMigration).toContain("pricing_outbox_events");
    expect(ordersOutbox).toContain("FOR UPDATE SKIP LOCKED");
    expect(ordersOutbox).toContain("eventId: event.id");
    expect(ordersOutbox).toContain("waitForConfirms");
  });

  it("compensa cancelaciones con consumidor idempotente, reintentos y DLQ", () => {
    const orders = read("services/orders-service/src/orders/orders.service.ts");
    const inventory = read("services/inventory-service/src/inventory/inventory.service.ts");
    const consumer = read("services/inventory-service/src/events/order-cancelled.consumer.ts");

    expect(orders).toContain('eventType: "order.cancelled.v1"');
    expect(inventory).toContain("inventory_processed_events");
    expect(inventory).toContain("ORDER_CANCELLATION_RESTOCK");
    expect(consumer).toContain("x-dead-letter-exchange");
    expect(consumer).toContain("x-retry-count");
    expect(consumer).toContain("consumerRetryLimit");
  });

  it("publica cambios de inventario y transiciones de promociones sin compartir bases", () => {
    const inventory = read("services/inventory-service/src/inventory/inventory.service.ts");
    const pricing = read("services/pricing-service/src/pricing/pricing.service.ts");

    expect(inventory).toContain('eventType: "inventory.stock.changed.v1"');
    expect(inventory).toContain('eventType: "inventory.low-stock.v1"');
    expect(pricing).toContain('eventType: "promotion.activated.v1"');
    expect(pricing).toContain('eventType: "promotion.expired.v1"');
    expect(inventory).not.toMatch(/orders_(?!outbox|schema)/i);
  });
});
