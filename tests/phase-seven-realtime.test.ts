import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(webRoot, relativePath), "utf8");

describe("Realtime e inventario operativo de la fase 7", () => {
  it("mantiene Realtime como microservicio independiente que consume el evento de Inventory", () => {
    const compose = read("compose.yaml");
    const consumer = read("services/realtime-service/src/realtime/inventory-stock.consumer.ts");

    expect(compose).toContain("realtime-service:");
    expect(compose).toContain("realtime-internal:");
    expect(consumer).toContain('"inventory.stock.changed.v1"');
    expect(consumer).toContain("realtime.inventory-stock.v1");
    expect(consumer).toContain("x-dead-letter-exchange");
    expect(consumer).not.toContain("postgres");
  });

  it("protege Socket.IO por Kong y valida de nuevo la sesión HTTP-only como ADMIN", () => {
    const kong = read("infra/kong/kong.yml.template");
    const gateway = read("services/realtime-service/src/realtime/realtime.gateway.ts");

    expect(kong).toContain("/realtime/socket.io");
    expect(kong).toContain("departamental_access");
    expect(gateway).toContain("departamental_access");
    expect(gateway).toContain('claims.role !== "ADMIN"');
    expect(gateway).toContain('"stock.updated"');
  });

  it("deriva el dashboard desde el contrato de Inventory vía Gateway y conserva el respaldo", () => {
    const dashboard = read("src/components/inventory-dashboard.tsx");
    const source = read("src/lib/inventory/dashboard.server.ts");
    const route = read("src/app/api/dashboard/inventory/route.ts");

    expect(source).toContain('gatewayJson<unknown>("/inventory"');
    expect(source).not.toContain("postgres-inventory");
    expect(route).toContain('user.role !== "ADMIN"');
    expect(dashboard).toContain('path: "/realtime/socket.io"');
    expect(dashboard).toContain('socket.on("stock.updated"');
    expect(dashboard).toContain("AGOTADO");
    expect(dashboard).toContain("Última sincronización");
  });
});
