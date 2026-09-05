import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { isActiveDestination, navigationForRole } from "../src/lib/auth/navigation";

describe("Navegación global por rol", () => {
  it.each([
    ["ADMIN", ["/", "/catalog/manage", "/dashboard", "/operations", "/crm", "/account"]],
    ["EMPLOYEE", ["/", "/operations", "/account"]],
    ["CUSTOMER", ["/", "/account"]],
    [null, ["/"]],
  ] as const)("ofrece todos y solo los destinos permitidos para %s, en orden estable", (role, expected) => {
    expect(navigationForRole(role).map(({ href }) => href)).toEqual(expected);
  });

  it("conserva los mismos nombres para los destinos compartidos", () => {
    const admin = navigationForRole("ADMIN");
    for (const role of ["EMPLOYEE", "CUSTOMER", null] as const) {
      for (const destination of navigationForRole(role)) {
        expect(destination.label).toBe(admin.find(({ href }) => href === destination.href)?.label);
      }
    }
  });

  it.each(["/", "/catalog/manage", "/dashboard", "/operations", "/crm", "/account", "/crm/customers/123"])(
    "marca una sola sección activa en %s",
    (pathname) => {
      expect(navigationForRole("ADMIN").filter(({ href }) => isActiveDestination(href, pathname))).toHaveLength(1);
    },
  );

  it("no confunde rutas con prefijos parecidos ni marca catálogo para todo", () => {
    expect(isActiveDestination("/", "/account")).toBe(false);
    expect(isActiveDestination("/crm", "/crm-other")).toBe(false);
    expect(navigationForRole("CUSTOMER").some(({ href }) => isActiveDestination(href, "/dashboard"))).toBe(false);
  });

  it("mantiene el shell fuera de las páginas para que persista durante una navegación", () => {
    const appRoot = path.resolve(import.meta.dirname, "../src/app");
    const platformLayout = readFileSync(path.join(appRoot, "(platform)", "layout.tsx"), "utf8");
    expect(platformLayout).toContain("<AppShell user={user}>{children}</AppShell>");
    expect(existsSync(path.join(appRoot, "(platform)", "page.tsx"))).toBe(true);
    expect(readFileSync(path.join(appRoot, "(platform)", "dashboard", "page.tsx"), "utf8")).not.toContain("<AppShell");
    expect(readFileSync(path.join(appRoot, "login", "page.tsx"), "utf8")).not.toContain("<AppShell");
  });
});
