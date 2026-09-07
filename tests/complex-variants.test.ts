import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("gestión de variantes complejas", () => {
  it("usa PATCH de Catalog desde una Server Action protegida como ADMIN", () => {
    const actions = read("src/app/catalog/manage/actions.ts");

    expect(actions).toContain("export async function updateCatalogVariant");
    expect(actions).toContain('await requireRole(["ADMIN"], "/catalog/manage")');
    expect(actions).toContain('`/variants/${encodeURIComponent(parsed.data.variantId)}`');
    expect(actions).toContain('method: "PATCH"');
    expect(actions).toContain("status: parsed.data.status");
  });

  it("muestra y edita talla, color, material y SKU sin exponer esta operación a otros roles", () => {
    const management = read("src/components/catalog-management.tsx");
    const navigation = read("src/lib/auth/navigation.ts");

    expect(management).toContain("Talla:");
    expect(management).toContain("Color:");
    expect(management).toContain("Material:");
    expect(management).toContain("Editar variante");
    expect(management).toContain("Dejar un atributo vacío lo elimina");
    expect(navigation).toContain('href: "/catalog/manage", label: "Gestionar catálogo", roles: ["ADMIN"]');
  });
});
