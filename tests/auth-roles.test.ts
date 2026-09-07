import { describe, expect, it } from "vitest";

import { hasRole, roleLabel, type SessionUser } from "@/lib/auth/roles";

const users: Record<SessionUser["role"], SessionUser> = {
  ADMIN: { id: "admin", email: "admin@example.com", name: "Admin", role: "ADMIN" },
  EMPLOYEE: { id: "employee", email: "employee@example.com", name: "Employee", role: "EMPLOYEE" },
  CUSTOMER: { id: "customer", email: "customer@example.com", name: "Customer", role: "CUSTOMER" },
};

describe("roles de interfaz", () => {
  it("mantiene los tres roles del contrato", () => {
    expect(Object.keys(users)).toEqual(["ADMIN", "EMPLOYEE", "CUSTOMER"]);
    expect(roleLabel).toMatchObject({ ADMIN: "Administración", EMPLOYEE: "Operación", CUSTOMER: "Cliente" });
  });

  it("solo habilita las superficies correspondientes", () => {
    expect(hasRole(users.ADMIN, ["ADMIN"])).toBe(true);
    expect(hasRole(users.EMPLOYEE, ["ADMIN"])).toBe(false);
    expect(hasRole(users.CUSTOMER, ["ADMIN", "EMPLOYEE"])).toBe(false);
    expect(hasRole(users.CUSTOMER, ["CUSTOMER"])).toBe(true);
    expect(hasRole(null, ["CUSTOMER"])).toBe(false);
  });
});
