import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("checkout de CUSTOMER", () => {
  it("mantiene una compra progresiva entre catálogo, bolsa persistente y checkout", () => {
    const catalog = read("src/components/catalog-experience.tsx");
    const checkout = read("src/components/customer-checkout.tsx");
    const cart = read("src/components/customer-cart-provider.tsx");
    const checkoutPage = read("src/app/(platform)/checkout/page.tsx");
    const shell = read("src/components/app-shell.tsx");

    expect(catalog).toContain("Elige una variante");
    expect(catalog).toContain("Agregar");
    expect(catalog).toContain("Ver bolsa");
    expect(checkout).toContain("Tu bolsa");
    expect(checkout).toContain("Sucursal de retiro");
    expect(checkout).toContain('type="radio"');
    expect(checkout).toContain("La disponibilidad y el precio vigentes se confirman");
    expect(checkout).toContain("No hay sucursales disponibles para retiro.");
    expect(checkout).toContain("Confirmar pedido");
    expect(checkout).toContain("Pedido confirmado");
    expect(checkout).toContain('href="/orders"');
    expect(checkout).toContain("Ver mis pedidos");
    expect(checkout).toContain("checkout.isPending");
    expect(checkout).toContain('role="status"');
    expect(cart).toContain("localStorage");
    expect(cart).toContain("consumeCustomerCart");
    expect(shell).toContain("CustomerBagLink");
    expect(checkoutPage).toContain('requireRole(["CUSTOMER"], "/checkout")');
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
    expect(checkout).toContain('"Cache-Control": "private, no-store"');
    expect(branches).toContain('"Cache-Control": "private, no-store"');
    expect(inventory).toContain('@Get("branches")');
    expect(kong).toContain("branches(?:/[^/]+)?");
  });
});
