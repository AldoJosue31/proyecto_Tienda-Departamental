import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("contrato de venta física", () => {
  it("persiste el canal de la venta en la base aislada de Orders", () => {
    const migration = read("services/orders-service/migrations/003_order_channel.sql");
    const repository = read("services/orders-service/src/orders/orders.repository.ts");

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS channel");
    expect(migration).toContain("'ONLINE', 'PHYSICAL'");
    expect(repository).toContain("branch_id, channel");
  });

  it("mantiene el checkout físico dentro de Orders y restringido a Operación", () => {
    const service = read("services/orders-service/src/orders/orders.service.ts");
    const repository = read("services/orders-service/src/orders/orders.repository.ts");
    const contract = read("docs/physical-sales-contract.md");

    expect(service).toContain("assertChannelAccess");
    expect(service).toContain("PHYSICAL_SALE_CUSTOMER_REQUIRED");
    expect(repository).toContain("PHYSICAL_SALE_CREATED");
    expect(service).toContain("this.inventory.reserve");
    expect(service).toContain("this.inventory.commit");
    expect(contract).toContain("inventory.stock.changed.v1");
    expect(contract).toContain("POST /inventory/movements");
  });
});
