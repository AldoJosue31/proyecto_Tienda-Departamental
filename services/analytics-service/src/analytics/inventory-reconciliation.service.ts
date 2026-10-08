import { Inject, Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { ANALYTICS_RUNTIME_CONFIG } from "../auth/token.service";
import type { AnalyticsRuntimeConfig } from "../config/environment";
import { DatabaseService } from "../database/database.service";
import { AnalyticsConsumer } from "./analytics.consumer";
import { AnalyticsService } from "./analytics.service";
import type { StockChangedEvent } from "./analytics.types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Snapshot = {
  branches: Array<{ id: string; name: string }>;
  items: Array<{ variantId: string; branch: { id: string; name: string }; onHand: number; reserved: number; available: number; lastUpdatedAt: string; revision: number }>;
  nextCursor: string | null;
  total: number;
};

@Injectable()
export class InventoryReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryReconciliationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly database: DatabaseService, private readonly analytics: AnalyticsService,
    private readonly consumer: AnalyticsConsumer,
    @Inject(ANALYTICS_RUNTIME_CONFIG) private readonly config: Pick<AnalyticsRuntimeConfig, "environment" | "inventoryServiceUrl" | "inventoryServiceKey" | "inventorySyncIntervalSeconds">) {}

  onModuleInit(): void {
    if (this.config.environment === "test") return;
    this.timer = setInterval(() => { if (this.consumer.isReady()) void this.reconcile(); }, this.config.inventorySyncIntervalSeconds * 1000);
    this.timer.unref();
    // The durable queue must exist before snapshot import, so concurrent sales are retained.
    this.consumer.whenReady(() => void this.reconcile());
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async reconcile(): Promise<void> {
    if (this.running) return;
    this.running = true;
    let imported = 0;
    try {
      await this.database.query("UPDATE analytics_inventory_sync SET started_at = NOW(), imported_rows = 0, last_error = NULL WHERE id = TRUE");
      let cursor: string | null = null;
      const visited = new Set<string>();
      do {
        const url = new URL("/internal/inventory/snapshot", this.config.inventoryServiceUrl);
        if (cursor) url.searchParams.set("cursor", cursor);
        const response = await fetch(url, { headers: { "x-internal-service-key": this.config.inventoryServiceKey }, signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error("Snapshot unavailable");
        const snapshot = this.snapshot(await response.json());
        await this.analytics.importInventory(snapshot.branches, snapshot.items.map((item) => ({
          variantId: item.variantId, branchId: item.branch.id, branchName: item.branch.name,
          onHand: item.onHand, reserved: item.reserved, available: item.available,
          lastUpdatedAt: item.lastUpdatedAt, revision: item.revision,
        })));
        imported += snapshot.items.length;
        await this.database.query("UPDATE analytics_inventory_sync SET imported_rows = $1, expected_rows = $2 WHERE id = TRUE", [imported, snapshot.total]);
        cursor = snapshot.nextCursor;
        if (cursor && visited.has(cursor)) throw new Error("Repeated snapshot cursor");
        if (cursor) visited.add(cursor);
        if (!cursor && imported !== snapshot.total) throw new Error("Inventory changed during snapshot enumeration");
      } while (cursor);
      await this.database.query("UPDATE analytics_inventory_sync SET completed_at = NOW(), last_error = NULL WHERE id = TRUE");
    } catch {
      await this.database.query("UPDATE analytics_inventory_sync SET last_error = 'Inventory reconciliation will be retried' WHERE id = TRUE").catch(() => undefined);
      this.logger.warn("Inventory reconciliation will be retried.");
    } finally { this.running = false; }
  }

  private snapshot(value: unknown): Snapshot {
    if (!value || typeof value !== "object") throw new Error("Invalid snapshot");
    const page = value as Snapshot;
    if (!Array.isArray(page.items) || page.items.length > 500 || !Array.isArray(page.branches) || !Number.isSafeInteger(page.total) || page.total < 0
      || (page.nextCursor !== null && (typeof page.nextCursor !== "string" || !UUID.test(page.nextCursor)))) throw new Error("Invalid snapshot page");
    for (const branch of page.branches) if (!branch || !UUID.test(branch.id) || typeof branch.name !== "string" || !branch.name.trim()) throw new Error("Invalid branch");
    for (const item of page.items) {
      if (!item || !UUID.test(item.variantId) || !item.branch || !UUID.test(item.branch.id) || typeof item.branch.name !== "string" || !item.branch.name.trim()
        || ![item.onHand, item.reserved, item.available].every((number) => Number.isSafeInteger(number) && number >= 0)
        || item.available !== item.onHand - item.reserved || !Number.isSafeInteger(item.revision) || item.revision < 1
        || typeof item.lastUpdatedAt !== "string" || Number.isNaN(Date.parse(item.lastUpdatedAt))) throw new Error("Invalid stock");
    }
    return page;
  }
}

export type InventorySnapshotItem = Pick<StockChangedEvent, "branchId" | "branchName" | "variantId" | "onHand" | "reserved" | "available" | "lastUpdatedAt" | "revision">;
