import { describe, expect, it } from "vitest";
import { allowedOperationalTransition, canCancelBeforeDispatch, requiresShipment, trackingFreshness } from "../src/shipments/shipments.service";

describe("transiciones operativas de Logistics", () => {
  it("solo permite Pendiente → Empacando → Enviado → Entregado", () => {
    expect(allowedOperationalTransition("PENDING", "PACKING")).toBe(true);
    expect(allowedOperationalTransition("PACKING", "SHIPPED")).toBe(true);
    expect(allowedOperationalTransition("PENDING", "SHIPPED")).toBe(false);
    expect(allowedOperationalTransition("SHIPPED", "DELIVERED")).toBe(true);
    expect(allowedOperationalTransition("CANCELLED", "PACKING")).toBe(false);
    expect(allowedOperationalTransition("SHIPPED", "PACKING")).toBe(false);
  });
});

describe("frescura de ubicación de repartidor", () => {
  it("distingue señal reciente, anterior y ausente", () => {
    const now = Date.parse("2026-09-03T12:00:00.000Z");
    expect(trackingFreshness("2026-09-03T11:57:00.000Z", now)).toBe("RECENT");
    expect(trackingFreshness("2026-09-03T11:54:59.000Z", now)).toBe("STALE");
    expect(trackingFreshness(null, now)).toBe("UNAVAILABLE");
  });
});

describe("canal de venta y preparación", () => {
  it("proyecta solamente ventas online como envíos", () => {
    expect(requiresShipment("ONLINE")).toBe(true);
    expect(requiresShipment("PHYSICAL")).toBe(false);
  });
});

describe("cancelación comercial antes de despacho", () => {
  it("acepta pendientes o en empaque y rechaza envíos ya despachados o entregados", () => {
    expect(canCancelBeforeDispatch("PENDING")).toBe(true);
    expect(canCancelBeforeDispatch("PACKING")).toBe(true);
    expect(canCancelBeforeDispatch("CANCELLED")).toBe(true);
    expect(canCancelBeforeDispatch("SHIPPED")).toBe(false);
    expect(canCancelBeforeDispatch("DELIVERED")).toBe(false);
  });
});
