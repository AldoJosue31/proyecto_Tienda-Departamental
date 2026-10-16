import { describe, expect, it, vi } from "vitest";
import { rejectUnlistedOrigins } from "../src/common/origin-policy";

describe("explicit origins", () => {
  it("rejects an unlisted origin without a 500", () => {
    const response = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }; response.status.mockReturnValue(response);
    const next = vi.fn();
    rejectUnlistedOrigins(["http://localhost:3105"])({ header: () => "https://unlisted.example" } as never, response as never, next);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: "ORIGIN_NOT_ALLOWED" }));
    expect(next).not.toHaveBeenCalled();
  });
  it.each([undefined, "http://localhost:3105"])("allows server clients and listed browsers", origin => {
    const next = vi.fn(); rejectUnlistedOrigins(["http://localhost:3105"])({ header: () => origin } as never, {} as never, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
