import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { ApiException } from "../src/common/api-exception";
import { RolesGuard } from "../src/common/roles.guard";

function contextFor(role: "ADMIN" | "EMPLOYEE" | "CUSTOMER"): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({
        authUser: {
          id: "db71f5d9-9c1b-4b83-a86a-344492af0d0c",
          email: "person@departamental.local",
          name: "Persona",
          role,
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  it("permite el endpoint administrativo a ADMIN", () => {
    const reflector = {
      getAllAndOverride: vi.fn(() => ["ADMIN"]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(contextFor("ADMIN"))).toBe(true);
  });

  it.each(["EMPLOYEE", "CUSTOMER"] as const)("deniega el endpoint administrativo a %s", (role) => {
    const reflector = {
      getAllAndOverride: vi.fn(() => ["ADMIN"]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(contextFor(role))).toThrow(ApiException);
    try {
      guard.canActivate(contextFor(role));
    } catch (error) {
      expect(error).toMatchObject({ code: "FORBIDDEN", getStatus: expect.any(Function) });
      expect((error as ApiException).getStatus()).toBe(403);
    }
  });
});
