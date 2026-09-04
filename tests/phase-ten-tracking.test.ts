import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(webRoot, relativePath), "utf8");

describe("Maps y tracking de repartidores de la fase 10", () => {
  it("mantiene repartidores y ubicaciones dentro de Logistics", () => {
    const migration = read("services/logistics-service/migrations/002_courier_tracking.sql");
    const service = read("services/logistics-service/src/shipments/shipments.service.ts");
    const controller = read("services/logistics-service/src/shipments/shipments.controller.ts");
    const outbox = read("services/logistics-service/src/events/outbox.service.ts");

    expect(migration).toContain("logistics_couriers");
    expect(migration).toContain("courier_id");
    expect(service).toContain("recordCourierLocation");
    expect(service).toContain("COURIER_NOT_ASSIGNED");
    expect(controller).toContain('Controller("couriers")');
    expect(controller).toContain('@Post(":id/location")');
    expect(outbox).toContain('"shipment.tracking.updated.v1"');
  });

  it("propaga ubicación por una cola dedicada y solo a operaciones autenticadas", () => {
    const consumer = read("services/realtime-service/src/realtime/courier-tracking.consumer.ts");
    const gateway = read("services/realtime-service/src/realtime/realtime.gateway.ts");
    const kong = read("infra/kong/kong.yml.template");

    expect(consumer).toContain("realtime.courier-tracking.v1");
    expect(consumer).toContain("shipment.tracking.updated.v1");
    expect(gateway).toContain('"courier.location.updated"');
    expect(gateway).toContain('claims.role !== "ADMIN" && claims.role !== "EMPLOYEE"');
    expect(kong).toContain("logistics-courier-location");
  });

  it("calcula rutas en servidor y degrada la interfaz si Maps no está disponible", () => {
    const routes = read("src/lib/logistics/courier-route.server.ts");
    const panel = read("src/components/shipment-tracking-panel.tsx");
    const account = read("src/app/account/page.tsx");

    expect(routes).toContain("GOOGLE_MAPS_ROUTES_API_KEY");
    expect(routes).toContain("routes.googleapis.com/directions/v2:computeRoutes");
    expect(routes).not.toContain("NEXT_PUBLIC_GOOGLE_MAPS_ROUTES_API_KEY");
    expect(panel).toContain("Google Maps no está configurado");
    expect(panel).toContain('"courier.location.updated"');
    expect(account).toContain("Mis entregas");
  });
});
