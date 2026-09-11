import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("detalle de pedido de CUSTOMER", () => {
  it("solicita un único pedido al contrato existente y oculta un recurso ajeno", () => {
    const page = read("src/app/(platform)/orders/[id]/page.tsx");
    const client = read("src/lib/orders/customer-orders.server.ts");
    const orders = read("services/orders-service/src/orders/orders.service.ts");

    expect(page).toContain('requireRole(["CUSTOMER"], `/orders/${encodeURIComponent(id)}`)');
    expect(page).toContain("notFound()");
    expect(client).toContain('gatewayJson<unknown>(`/orders/${encodeURIComponent(orderId)}`');
    expect(orders).toContain("this.assertOwner(order, actor)");
  });

  it("muestra estado, artículos y entrega sin exponer datos personales de reparto", () => {
    const detail = read("src/components/customer-order-detail.tsx");

    expect(detail).toContain("Detalle de pedido");
    expect(detail).toContain("Preparación pendiente");
    expect(detail).toContain("Por tu privacidad");
    expect(detail).not.toContain("courier");
    expect(detail).not.toContain("latitude");
    expect(detail).not.toContain("deliveryAddress");
  });
});
