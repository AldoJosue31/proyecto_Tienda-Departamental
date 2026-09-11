import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("facetas reales del catálogo", () => {
  it("calcula categorías y marcas en Catalog sin reutilizar solo los productos de la página", () => {
    const repository = read("services/catalog-service/src/catalog/catalog.repository.ts");
    const contract = read("services/catalog-service/src/catalog/catalog.types.ts");

    expect(repository).toContain('this.publicSearchWhere({ includeCategory: false })');
    expect(repository).toContain('this.publicSearchWhere({ includeBrand: false })');
    expect(repository).toContain("categories: this.toFacets(categoriesResult.rows)");
    expect(repository).toContain("brands: this.toFacets(brandsResult.rows)");
    expect(contract).toContain("facets:");
  });

  it("muestra los conteos entregados por Catalog y conserva el estado vacío recuperable", () => {
    const catalog = read("src/components/catalog-experience.tsx");

    expect(catalog).toContain("page.facets.categories");
    expect(catalog).toContain("page.facets.brands");
    expect(catalog).toContain(">{facet.name} ({facet.count})</option>");
    expect(catalog).toContain("No encontramos coincidencias");
    expect(catalog).toContain("Reintentar");
  });
});
