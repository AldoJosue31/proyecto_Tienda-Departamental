import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(webRoot, relativePath), "utf8");

describe("arquitectura de las fases 1 y 2", () => {
  it("mantiene Catalog aislado detrás de Kong con PostgreSQL y Redis propios", () => {
    const compose = read("compose.yaml");
    const kong = read("infra/kong/kong.yml.template");

    expect(compose).toContain("catalog-service:");
    expect(compose).toContain("catalog-postgres:");
    expect(compose).toContain("catalog-redis:");
    expect(compose).toContain("catalog-internal:");
    expect(compose).toContain("catalog_postgres_data:");
    expect(compose).toContain("catalog_redis_data:");
    expect(compose).not.toMatch(/catalog-service:[\s\S]{0,900}\n\s+ports:/);
    expect(compose).not.toMatch(/catalog-postgres:[\s\S]{0,700}\n\s+ports:/);
    expect(kong).toContain("url: http://catalog-service:3002");
    expect(kong).toContain("name: catalog-read");
    expect(kong).toContain("name: catalog-create-product");
    expect(kong).toContain("name: catalog-update-variant");
  });

  it("deja las lecturas públicas y protege las mutaciones de catálogo", () => {
    const kong = read("infra/kong/kong.yml.template");
    const publicRead = kong.slice(kong.indexOf("name: catalog-read"), kong.indexOf("name: catalog-create-product"));
    const productCreate = kong.slice(kong.indexOf("name: catalog-create-product"), kong.indexOf("name: catalog-update-product"));

    expect(publicRead).toContain("- GET");
    expect(publicRead).not.toContain("name: jwt");
    expect(productCreate).toContain("- POST");
    expect(productCreate).toContain("name: jwt");
    expect(read("services/catalog-service/src/catalog/catalog.controller.ts")).toContain('@Roles("ADMIN")');
  });

  it("renueva y revoca sesiones con refresh aun sin access token", () => {
    const kong = read("infra/kong/kong.yml.template");
    const refresh = kong.slice(kong.indexOf("name: auth-refresh"), kong.indexOf("name: auth-logout"));
    const logout = kong.slice(kong.indexOf("name: auth-logout"), kong.indexOf("name: auth-me"));
    const authController = read("services/auth-service/src/auth/auth.controller.ts");
    const proxy = read("src/proxy.ts");

    expect(refresh).not.toContain("name: jwt");
    expect(logout).not.toContain("name: jwt");
    expect(authController).toContain("OptionalJwtAuthGuard");
    expect(proxy).toContain("refreshResponse(request, refreshToken, accessToken)");
  });

  it("retira el endpoint de catálogo local y usa Server Components más TanStack Query", () => {
    expect(existsSync(path.join(webRoot, "src/app/api/products/route.ts"))).toBe(false);
    expect(existsSync(path.join(webRoot, "src/app/api/products/[productId]/route.ts"))).toBe(false);
    expect(read("src/app/(platform)/page.tsx")).toContain("getCatalogPage");
    expect(read("src/components/catalog-experience.tsx")).toContain("@tanstack/react-query");
    expect(read("src/components/catalog-experience.tsx")).not.toContain('fetch("/api/products');
  });
});
