import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("caja de venta física", () => {
  it("mantiene la confirmación detrás de una BFF protegida y de Orders", () => {
    const route = read("src/app/api/operations/sales/route.ts");

    expect(route).toContain('user.role !== "ADMIN" && user.role !== "EMPLOYEE"');
    expect(route).toContain('gatewayJson<unknown>("/orders"');
    expect(route).toContain('channel: "PHYSICAL"');
    expect(route).toContain('"Idempotency-Key": key');
    expect(route).not.toContain("/inventory/movements");
  });

  it("muestra variantes y existencias por sucursal sin prometer un precio final local", () => {
    const desk = read("src/components/physical-sales-desk.tsx");

    expect(desk).toContain("physical-sales-inventory");
    expect(desk).toContain('"AGOTADO"');
    expect(desk).toContain("Pricing confirma promociones y el total final");
    expect(desk).toContain("Confirmar venta");
  });

  it("mantiene un destino de venta física separado y activo para Operations", () => {
    const navigation = read("src/lib/auth/navigation.ts");
    const menu = read("src/components/navigation-menu.tsx");

    expect(navigation).toContain('href: "/operations/sales"');
    expect(menu).toContain("right.href.length - left.href.length");
  });
});
