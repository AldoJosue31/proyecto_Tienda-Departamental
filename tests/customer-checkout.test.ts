import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("checkout de CUSTOMER", () => {
  it("presenta una compra progresiva desde una variante del catálogo", () => {
    const catalog = read("src/components/catalog-experience.tsx");

    expect(catalog).toContain("Elige una variante");
    expect(catalog).toContain("Agregar");
    expect(catalog).toContain("Tu compra");
    expect(catalog).toContain("Sucursal de retiro");
    expect(catalog).toContain("Confirmar pedido");
    expect(catalog).toContain('userRole === "CUSTOMER"');
  });

  it("mantiene sucursales en Inventory y pedidos en Orders", () => {
    const branches = read("src/app/api/checkout/branches/route.ts");
    const checkout = read("src/app/api/checkout/route.ts");
    const inventory = read("services/inventory-service/src/inventory/inventory.controller.ts");
    const kong = read("infra/kong/kong.yml.template");

    expect(branches).toContain('"/inventory/branches"');
    expect(checkout).toContain('gatewayJson<unknown>("/orders"');
    expect(checkout).toContain('channel: "ONLINE"');
    expect(checkout).toContain('user.role !== "CUSTOMER"');
    expect(inventory).toContain('@Get("branches")');
    expect(kong).toContain("branches(?:/[^/]+)?");
  });
});
