import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./safe-return-path";
import { newPasswordSchema, registerSchema } from "./onboarding-schemas";

describe("Role-aware local return destinations", () => {
  it("keeps checkout, order detail and account paths for customers", () => {
    for (const value of ["/", "/checkout?branch=centro", "/orders", "/orders/fixture-id?tab=tracking", "/account"]) {
      expect(safeReturnPath(value, "CUSTOMER")).toBe(value);
    }
  });

  it("limits employee navigation to operational areas and administrator navigation to known routes", () => {
    expect(safeReturnPath("/operations/inventory?branch=centro", "EMPLOYEE")).toBe("/operations/inventory?branch=centro");
    expect(safeReturnPath("/users?page=2", "ADMIN")).toBe("/users?page=2");
    for (const role of ["CUSTOMER", "EMPLOYEE"] as const) expect(safeReturnPath("/users", role)).toBe("/");
    expect(safeReturnPath("/checkout", "EMPLOYEE")).toBe("/");
    expect(safeReturnPath("/operations", "CUSTOMER")).toBe("/");
    expect(safeReturnPath("/catalog/manage", "CUSTOMER")).toBe("/");
    expect(safeReturnPath("/unrecognized", "ADMIN")).toBe("/");
  });

  it("rejects external, encoded, control and route-prefix tricks", () => {
    for (const value of [
      "https://attacker.test", "//attacker.test", "/\\attacker.test", "javascript:alert(1)",
      "/checkout\r\nLocation: https://attacker.test", "/checkout\u007f", "/orders/%2f%2fattacker.test",
      "/orders/%5cadmin", "/orders/%00fixture", "/orders/%0afixture", "/orders/%2e%2e/users",
      "/orders-malicious", "/checkout-fake", "/users", "/shop", "/cart", "/tracking",
    ]) expect(safeReturnPath(value, "CUSTOMER"), value).toBe("/");
    expect(safeReturnPath(null)).toBe("/");
    expect(safeReturnPath({ path: "/checkout" })).toBe("/");
    expect(safeReturnPath("/checkout?value=" + "x".repeat(512))).toBe("/");
  });

  it("does not carry link secrets through next and strips fragments", () => {
    for (const query of ["token=secret", "access_token=secret", "password=secret", "Secret=secret", "nonce=secret", "csrf=secret", "%74oken=secret"]) {
      expect(safeReturnPath("/checkout?" + query)).toBe("/");
    }
    expect(safeReturnPath("/checkout#token=secret")).toBe("/checkout");
  });
});

describe("New-password and request contract validation", () => {
  it("counts Unicode characters consistently with Auth and enforces bcrypt bytes without truncation", () => {
    expect(newPasswordSchema.safeParse("🧡".repeat(14)).success).toBe(false);
    expect(newPasswordSchema.safeParse("🧡".repeat(15)).success).toBe(true);
    expect(newPasswordSchema.safeParse("🧡".repeat(19)).success).toBe(false);
    expect(newPasswordSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(newPasswordSchema.safeParse("a".repeat(73)).success).toBe(false);
    expect(newPasswordSchema.safeParse("una frase de acceso segura").success).toBe(true);
  });

  it("normalizes email and forbids privilege fields and browser-supplied nonce", () => {
    const body = { name: " Cliente ", email: " Cliente@Example.test ", password: "una frase de acceso segura", returnPath: "/checkout" };
    expect(registerSchema.parse(body)).toMatchObject({ name: "Cliente", email: "cliente@example.test" });
    for (const [field, value] of [["role", "ADMIN"], ["isActive", true], ["emailVerifiedAt", "2026-01-01"], ["authVersion", 1], ["browserNonce", "attacker"]]) {
      expect(registerSchema.safeParse({ ...body, [String(field)]: value }).success).toBe(false);
    }
    expect(registerSchema.safeParse({ ...body, returnPath: "/checkout?value=" + "x".repeat(512) }).success).toBe(false);
  });
});
