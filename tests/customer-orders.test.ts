import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("historial de pedidos de CUSTOMER", () => {
  it("expone una consulta propia protegida, sin reutilizar la lista operativa", () => {
    const controller = read("services/orders-service/src/orders/orders.controller.ts");
    const service = read("services/orders-service/src/orders/orders.service.ts");
    const repository = read("services/orders-service/src/orders/orders.repository.ts");
    const gateway = read("infra/kong/kong.yml.template");

    expect(controller).toContain('@Get("mine")');
    expect(controller).toContain('@Roles("CUSTOMER")');
    expect(service).toContain("listMine(actor");
    expect(service).toContain("this.repository.listForCustomer(actor.id)");
    expect(repository).toContain("listForCustomer(customerId");
    expect(repository).toContain("WHERE customer_id = $1");
    expect(gateway).toContain('"~/orders/[^/]+$"');
  });

  it("mantiene el historial detrás de una BFF, una ruta CUSTOMER y navegación explícita", () => {
    const bff = read("src/app/api/orders/mine/route.ts");
    const page = read("src/app/(platform)/orders/page.tsx");
    const navigation = read("src/lib/auth/navigation.ts");
    const experience = read("src/components/customer-orders.tsx");

    expect(bff).toContain('user.role !== "CUSTOMER"');
    expect(bff).toContain('gatewayJson<unknown>("/orders/mine"');
    expect(bff).toContain('Cache-Control": "private, no-store"');
    expect(page).toContain('requireRole(["CUSTOMER"], "/orders")');
    expect(navigation).toContain('{ href: "/orders", label: "Mis pedidos", roles: ["CUSTOMER"] }');
    expect(experience).toContain("Aún no tienes pedidos");
    expect(experience).toContain("Ver artículos y variantes");
    expect(experience).toContain('href={`/orders/${order.id}`}');
    expect(experience).toContain("No pudimos cargar tus pedidos");
  });
});
