import { describe, expect, it, vi } from "vitest";

import { ApiException } from "../src/common/api-exception";
import { RolesGuard } from "../src/common/roles.guard";

function contextWith(role: "ADMIN" | "EMPLOYEE" | "CUSTOMER" | null) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        authUser: role ? { id: "user-id", role } : undefined,
      }),
    }),
  };
}

describe("RolesGuard", () => {
  it("allows ADMIN for an ADMIN-only mutation", () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(["ADMIN"]),
    };
    const guard = new RolesGuard(reflector as never);

    expect(guard.canActivate(contextWith("ADMIN") as never)).toBe(true);
  });

  it.each(["EMPLOYEE", "CUSTOMER"] as const)("rejects %s for a catalog mutation", (role) => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(["ADMIN"]),
    };
    const guard = new RolesGuard(reflector as never);

    expect(() => guard.canActivate(contextWith(role) as never)).toThrow(ApiException);
  });

  it("rejects a mutation with no authenticated user", () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(["ADMIN"]),
    };
    const guard = new RolesGuard(reflector as never);

    expect(() => guard.canActivate(contextWith(null) as never)).toThrow(ApiException);
  });
});
