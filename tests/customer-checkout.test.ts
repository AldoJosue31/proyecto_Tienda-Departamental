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
    expect(checkout).toContain("Sucursal que atiende el pedido");
    expect(checkout).toContain('type="radio"');
    expect(checkout).toContain("no confirma una modalidad de entrega");
    expect(checkout).toContain("No hay sucursales de atención disponibles.");
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
    expect(catalog).not.toContain("retiro");
    expect(checkout).not.toContain("retiro");
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

  it("usa la BFF para el catálogo y conserva el encuadre de imágenes en la bolsa", () => {
    const client = read("src/lib/catalog/catalog-client.ts");
    const catalogRoute = read("src/app/api/catalog/route.ts");
    const productRoute = read("src/app/api/catalog/products/[id]/route.ts");
    const checkout = read("src/components/customer-checkout.tsx");
    const image = read("src/lib/catalog/product-image.ts");

    expect(client).toContain('fetch(`/api/catalog?${buildSearchParams(search)}`');
    expect(client).toContain('fetch(`/api/catalog/products/${encodeURIComponent(productId)}`');
    expect(client).not.toContain("localhost:8000");
    expect(catalogRoute).toContain("gatewayJson<unknown>(`/products?");
    expect(productRoute).toContain('gatewayJson<unknown>(`/products/${encodeURIComponent(parsed.data.id)}`');
    expect(checkout).toContain("catalogProductImageStyle(item.product)");
    expect(image).toContain('backgroundSize: "300% 200%"');
  });
});
