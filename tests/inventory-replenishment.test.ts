import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("reabastecimiento operativo", () => {
  it("protege la BFF y resuelve el snapshot desde Catalog antes de llamar a Inventory", () => {
    const route = read("src/app/api/operations/inventory/movements/route.ts");

    expect(route).toContain('user.role !== "ADMIN" && user.role !== "EMPLOYEE"');
    expect(route).toContain('`/products/${encodeURIComponent(input.data.productId)}`');
    expect(route).toContain('gatewayJson<unknown>("/inventory/movements"');
    expect(route).toContain("catalogSnapshot:");
    expect(route).not.toContain('z.enum(["RECEIPT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "PHYSICAL_SALE"])');
  });

  it("mantiene el flujo de reabastecimiento separado de la caja y visible solo al personal", () => {
    const desk = read("src/components/inventory-replenishment-desk.tsx");
    const navigation = read("src/lib/auth/navigation.ts");

    expect(desk).toContain("Las ventas físicas se confirman en Caja");
    expect(desk).toContain("Talla:");
    expect(desk).toContain("Color:");
    expect(desk).toContain("Material:");
    expect(navigation).toContain('href: "/operations/inventory"');
    expect(navigation).toContain('roles: ["ADMIN", "EMPLOYEE"]');
  });
});
