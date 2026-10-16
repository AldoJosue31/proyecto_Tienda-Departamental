// Executes real service classes on disposable databases provided by the audit.
import "../inventory-service/node_modules/reflect-metadata/Reflect.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseService as InventoryDatabase } from "../inventory-service/src/database/database.service";
import { InventoryService } from "../inventory-service/src/inventory/inventory.service";
import { InventoryOutboxService } from "../inventory-service/src/events/outbox.service";
import { DatabaseService as OrdersDatabase } from "../orders-service/src/database/database.service";
import { DatabaseService as PricingDatabase } from "../pricing-service/src/database/database.service";
import { PricingService } from "../pricing-service/src/pricing/pricing.service";
import { PricingOutboxService } from "../pricing-service/src/events/outbox.service";

async function main() {
  assert.match(process.env.AUDIT_DISPOSABLE_CONTAINER ?? "", /^departamental-supabase-audit-[a-f0-9]{8}$/);
  const urls = JSON.parse(process.env.AUDIT_DATABASE_URLS ?? "{}");
  for (const [domain, value] of Object.entries(urls)) {
    const url = new URL(String(value));
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.pathname, "/audit_private_" + domain);
    assert.match(url.username, /^audit_private_/);
  }
  const config = (domain: string) => ({ databaseUrl: urls[domain], databaseSsl: false });
  const inventoryDb = new InventoryDatabase(config("inventory"));
  const ordersDb = new OrdersDatabase(config("orders"));
  const pricingDb = new PricingDatabase(config("pricing"));
  const inventoryOutbox = new InventoryOutboxService(inventoryDb, { environment: "test", rabbitmqUrl: "amqp://unused", outboxPublishIntervalMilliseconds: 1000 });
  const inventory = new InventoryService(inventoryDb, inventoryOutbox, { reservationTtlSeconds: 900 });
  const pricingOutbox = new PricingOutboxService(pricingDb, { environment: "test", rabbitmqUrl: "amqp://unused", outboxPublishIntervalMilliseconds: 1000 });
  const pricing = new PricingService(pricingDb, pricingOutbox, { environment: "test", schedulerIntervalSeconds: 30 });
  const checks: Array<Record<string, unknown>> = [];
  async function check(name: string, operation: () => Promise<Record<string, unknown> | void>) {
    const details = await operation();
    checks.push({ name, passed: true, ...details });
  }
  async function fixture() {
    const branchId = randomUUID(), variantId = randomUUID();
    await inventoryDb.query("INSERT INTO inventory_branches(id,name) VALUES($1,$2)", [branchId, "Audit " + branchId]);
    await inventoryDb.query("INSERT INTO inventory_variant_snapshots(variant_id,product_name,sku,variant_label) VALUES($1,'Audit product',$2,'M / Blue')", [variantId, "AUDIT-" + variantId]);
    const stockId = (await inventoryDb.query("INSERT INTO inventory_stock(variant_id,branch_id,on_hand,reserved,reorder_point) VALUES($1,$2,1,0,0) RETURNING id", [variantId, branchId])).rows[0].id;
    return { branchId, variantId, stockId, quantity: 1, orderId: randomUUID() };
  }
  try {
    await check("Real Inventory reserve: 20 simultaneous buyers compete for the last unit", async () => {
      const item = await fixture();
      const keys = Array.from({ length: 20 }, () => randomUUID());
      const outcomes = await Promise.allSettled(keys.map(key => inventory.reserve(item, key, "audit-race")));
      const winner = outcomes.findIndex(outcome => outcome.status === "fulfilled");
      assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
      assert.equal(outcomes.filter(outcome => outcome.status === "rejected" && outcome.reason.code === "OUT_OF_STOCK").length, 19);
      const outcome = outcomes[winner];
      assert.equal(outcome.status, "fulfilled");
      if (outcome.status !== "fulfilled") throw new Error("Missing race winner");
      const before = Number((await inventoryDb.query("SELECT count(*) AS count FROM inventory_outbox_events")).rows[0].count);
      const replay = await inventory.reserve(item, keys[winner], "audit-replay");
      assert.equal(replay.reservation.id, outcome.value.reservation.id);
      assert.equal(Number((await inventoryDb.query("SELECT count(*) AS count FROM inventory_outbox_events")).rows[0].count), before);
      const commitKey = randomUUID();
      await inventory.commitReservation(replay.reservation.id, commitKey, "audit-commit");
      await inventory.commitReservation(replay.reservation.id, commitKey, "audit-commit-replay");
      const stock = (await inventoryDb.query("SELECT on_hand,reserved,revision FROM inventory_stock WHERE id=$1", [item.stockId])).rows[0];
      assert.equal(stock.on_hand, 0); assert.equal(stock.reserved, 0); assert.ok(Number(stock.revision) > 1);
      return { buyers: 20, successfulReservations: 1, outOfStock: 19, replayDoesNotDuplicateEvents: true, commitReplayDoesNotDoubleConsume: true };
    });
    await check("Inventory reservation release returns the unit to availability", async () => {
      const item = await fixture();
      const reserved = await inventory.reserve(item, randomUUID(), "audit-release");
      await inventory.releaseReservation(reserved.reservation.id, randomUUID(), "audit-release");
      const next = await inventory.reserve({ ...item, orderId: randomUUID() }, randomUUID(), "audit-reserve-again");
      assert.equal(next.reservation.status, "RESERVED");
    });
    await check("Inventory rolls back stock, reservation and outbox together when enqueue fails", async () => {
      const item = await fixture();
      const before = Number((await inventoryDb.query("SELECT count(*) AS count FROM inventory_outbox_events")).rows[0].count);
      const failingOutbox = { enqueue: async (client: any, event: any) => { await inventoryOutbox.enqueue(client, event); throw new Error("audit injected failure"); } } as InventoryOutboxService;
      const failingService = new InventoryService(inventoryDb, failingOutbox, { reservationTtlSeconds: 900 });
      await assert.rejects(failingService.reserve(item, randomUUID(), "audit-rollback"), /audit injected failure/);
      const stock = (await inventoryDb.query("SELECT on_hand,reserved FROM inventory_stock WHERE id=$1", [item.stockId])).rows[0];
      assert.equal(stock.on_hand, 1); assert.equal(stock.reserved, 0);
      assert.equal(Number((await inventoryDb.query("SELECT count(*) AS count FROM inventory_reservations WHERE stock_id=$1", [item.stockId])).rows[0].count), 0);
      assert.equal(Number((await inventoryDb.query("SELECT count(*) AS count FROM inventory_outbox_events")).rows[0].count), before);
    });
    await check("Two real Inventory outbox workers claim disjoint rows using SKIP LOCKED", async () => {
      const payload = (await inventoryDb.query("SELECT payload FROM inventory_outbox_events LIMIT 1")).rows[0].payload;
      await inventoryDb.withTransaction(async client => {
        for (let index = 0; index < 50; index++) {
          await inventoryOutbox.enqueue(client, { eventType: "inventory.stock.changed.v1", correlationId: "audit-outbox-workers", data: payload });
        }
      });
      const second = new InventoryOutboxService(inventoryDb, { environment: "test", rabbitmqUrl: "amqp://unused", outboxPublishIntervalMilliseconds: 1000 });
      const [a, b] = await Promise.all([(inventoryOutbox as any).claimPending(), (second as any).claimPending()]);
      const firstIds = new Set(a.map((row: any) => row.id));
      assert.equal(a.length, 25); assert.equal(b.length, 25);
      assert.equal(b.filter((row: any) => firstIds.has(row.id)).length, 0);
      return { firstWorkerClaims: a.length, secondWorkerClaims: b.length, duplicates: 0 };
    });
    await check("Real Orders session advisory lock serializes operations and explicitly unlocks", async () => {
      const key = randomUUID();
      let active = 0, peak = 0;
      await Promise.all(Array.from({ length: 8 }, () => ordersDb.withAdvisoryLock(key, async client => {
        active++; peak = Math.max(peak, active);
        await client.query("SELECT pg_sleep(0.015)");
        active--;
      })));
      assert.equal(peak, 1);
      const remaining = Number((await ordersDb.query("SELECT count(*) AS count FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database())")).rows[0].count);
      assert.equal(remaining, 0);
      return { concurrentOperations: 8, maximumSimultaneousCriticalSections: peak, locksLeftBehind: remaining };
    });
    await check("Real Pricing activates at Mexico City midnight, only once, with transactional event", async () => {
      const start = new Date("2026-10-12T00:00:00-06:00");
      const id = randomUUID();
      await pricingDb.query("INSERT INTO pricing_promotions(id,name,status,discount_type,discount_value,starts_at,ends_at,timezone,created_by) VALUES($1,'Audit midnight','SCHEDULED','PERCENTAGE',10,$2,$3,'America/Mexico_City',$4)", [id, start, new Date(start.getTime() + 3600000), randomUUID()]);
      await pricingDb.query("INSERT INTO pricing_promotion_targets(promotion_id,scope,target_id) VALUES($1,'ALL',NULL)", [id]);
      assert.deepEqual(await pricing.reconcilePromotionStates(new Date(start.getTime() - 1)), { activated: 0, expired: 0 });
      assert.deepEqual(await pricing.reconcilePromotionStates(start), { activated: 1, expired: 0 });
      assert.deepEqual(await pricing.reconcilePromotionStates(start), { activated: 0, expired: 0 });
      const events = (await pricingDb.query("SELECT event_type,payload FROM pricing_outbox_events")).rows;
      assert.equal(events.length, 1); assert.equal(events[0].event_type, "promotion.activated.v1");
      return { businessTimezone: "America/Mexico_City", utcBoundary: start.toISOString(), duplicateEvents: 0, schedulerTickNotMeasured: true };
    });
    console.log("AUDIT_RUNTIME=" + JSON.stringify(checks));
  } finally {
    await Promise.all([inventoryDb.onModuleDestroy(), ordersDb.onModuleDestroy(), pricingDb.onModuleDestroy()]);
  }
}
main().catch(error => { console.error("Disposable runtime audit failed: " + error.message); process.exitCode = 1; });
