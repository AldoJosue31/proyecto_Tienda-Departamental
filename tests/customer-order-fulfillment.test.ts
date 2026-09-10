import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("seguimiento poscompra de CUSTOMER", () => {
  it("mantiene Logistics como fuente aislada y filtra defensivamente por la identidad autenticada", () => {
    const client = read("src/lib/logistics/customer-shipments.server.ts");
    const logistics = read("services/logistics-service/src/shipments/shipments.service.ts");

    expect(client).toContain('gatewayJson<unknown>("/shipments"');
    expect(client).toContain("shipment.customerId === customerId");
    expect(client).toContain("toCustomerShipment");
    expect(client).not.toContain("logistics-postgres");
    expect(logistics).toContain("WHERE customer_id = $1");
    expect(logistics).toContain("actor.role === \"CUSTOMER\"");
  });

  it("expone entregas solo a CUSTOMER por BFF y no filtra ubicación ni repartidor al navegador", () => {
    const bff = read("src/app/api/orders/shipments/route.ts");
    const contract = read("src/lib/logistics/customer-shipments.ts");

    expect(bff).toContain('user.role !== "CUSTOMER"');
    expect(bff).toContain("getCustomerShipmentsFor(user.id)");
    expect(bff).toContain('Cache-Control": "private, no-store"');
    expect(bff).toContain('headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId }');
    expect(contract).not.toContain("latitude");
    expect(contract).not.toContain("courier");
    expect(contract).not.toContain("deliveryAddress");
  });

  it("une el avance de entrega al pedido, mantiene recuperación y evita duplicarlo en Mi cuenta", () => {
    const orders = read("src/components/customer-orders.tsx");
    const page = read("src/app/(platform)/orders/page.tsx");
    const account = read("src/app/(platform)/account/page.tsx");

    expect(page).toContain("getCustomerShipmentsFor(user.id)");
    expect(orders).toContain('fetch("/api/orders/shipments"');
    expect(orders).toContain("FulfillmentProgress");
    expect(orders).toContain('shipment || order.status === "CONFIRMED"');
    expect(orders).toContain("Preparación pendiente");
    expect(orders).toContain("Tus pedidos siguen disponibles.");
    expect(orders).toContain("Reintentar");
    expect(account).toContain("Ver pedidos y entregas");
    expect(account).not.toContain("getCustomerShipments");
  });
});
