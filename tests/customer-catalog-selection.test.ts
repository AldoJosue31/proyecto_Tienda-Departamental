import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("selección de variantes para CUSTOMER", () => {
  it("requiere una selección explícita antes de añadir a la bolsa", () => {
    const catalog = read("src/components/catalog-experience.tsx");

    expect(catalog).toContain('role="radiogroup"');
    expect(catalog).toContain('type="radio"');
    expect(catalog).toContain("checked={selected}");
    expect(catalog).toContain("disabled={!selectedVariant || justAdded}");
    expect(catalog).toContain("Agregar a la bolsa");
  });

  it("muestra atributos complejos y conserva las acciones según el rol", () => {
    const catalog = read("src/components/catalog-experience.tsx");

    expect(catalog).toContain("Color: ${variant.color}");
    expect(catalog).toContain("Talla: ${variant.size}");
    expect(catalog).toContain("Material: ${variant.material}");
    expect(catalog).toContain('canBuy ? "Elegir y agregar" : "Ver variantes"');
    expect(catalog).toContain('userRole === "CUSTOMER"');
  });
});
