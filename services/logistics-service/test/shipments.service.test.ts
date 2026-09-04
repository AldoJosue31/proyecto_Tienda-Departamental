import { describe, expect, it } from "vitest";
import { allowedOperationalTransition } from "../src/shipments/shipments.service";

describe("transiciones operativas de Logistics", () => {
  it("solo permite Pendiente → Empacando → Enviado", () => {
    expect(allowedOperationalTransition("PENDING", "PACKING")).toBe(true);
    expect(allowedOperationalTransition("PACKING", "SHIPPED")).toBe(true);
    expect(allowedOperationalTransition("PENDING", "SHIPPED")).toBe(false);
    expect(allowedOperationalTransition("CANCELLED", "PACKING")).toBe(false);
    expect(allowedOperationalTransition("SHIPPED", "PACKING")).toBe(false);
  });
});
