import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(webRoot, relativePath), "utf8");

describe("Fase 11: CRM proyectado y segmentación", () => {
  it("aísla CRM con PostgreSQL, red y contenedor propios", () => {
    const compose = read("compose.yaml");
    expect(compose).toContain("crm-service:");
    expect(compose).toContain("crm-postgres:");
    expect(compose).toContain("crm-internal:");
    expect(compose).toContain("crm_postgres_data:");
    expect(compose).not.toMatch(/crm-service:[\s\S]{0,950}\n\s+ports:/);
  });

  it("proyecta compras desde RabbitMQ con idempotencia y DLQ, sin leer Orders DB", () => {
    const consumer = read("services/crm-service/src/crm/crm.consumer.ts");
    const service = read("services/crm-service/src/crm/crm.service.ts");
    expect(consumer).toContain('"order.completed.v1"');
    expect(consumer).toContain('"order.cancelled.v1"');
    expect(consumer).toContain('const QUEUE = "crm.order-projections.v1"');
    expect(consumer).toContain('const DLQ = QUEUE + ".dlq"');
    expect(service).toContain("crm_processed_events");
    expect(service).toContain("crm_cancelled_orders");
    expect(service).not.toContain("orders_service");
  });

  it("protege CRM con ADMIN en Gateway, backend y BFF", () => {
    const kong = read("infra/kong/kong.yml.template");
    expect(kong).toContain("url: http://crm-service:3009");
    expect(kong).toContain("name: crm-customers");
    expect(kong).toContain("name: crm-inactive-segment");
    expect(read("services/crm-service/src/crm/crm.controller.ts")).toContain('@Roles("ADMIN")');
    expect(read("src/app/api/crm/customers/route.ts")).toContain('user.role !== "ADMIN"');
  });

  it("expone una interfaz administrativa con historial, preview y estado vacío", () => {
    expect(existsSync(path.join(webRoot, "src/app/(platform)/crm/page.tsx"))).toBe(true);
    const workspace = read("src/components/crm-workspace.tsx");
    expect(workspace).toContain("@tanstack/react-query");
    expect(workspace).toContain("Historial de compras");
    expect(workspace).toContain("Clientes inactivos");
    expect(read("services/crm-service/src/crm/crm.service.ts")).toContain("excluye identidades sin compras proyectadas");
  });
});
