import { describe, expect, it } from "vitest";
import { inactiveCutoff } from "../src/crm/inactive-cutoff";
import { CrmService } from "../src/crm/crm.service";

describe("inactive calendar cutoff in Mexico City", () => {
  it.each([
    ["2026-05-31T18:00:00.123Z", "2026-02-28T18:00:00.123Z"],
    ["2024-05-31T18:00:00.000Z", "2024-02-29T18:00:00.000Z"],
    ["2026-03-31T18:00:00.000Z", "2025-12-31T18:00:00.000Z"],
    // UTC June 1 is still May 31 in the business timezone.
    ["2026-06-01T02:00:00.000Z", "2026-03-01T02:00:00.000Z"],
  ])("clamps %s to %s", (reference, expected) => {
    expect(inactiveCutoff(new Date(reference), 3).toISOString()).toBe(expected);
  });
  it.each(["1", "2"])("rejects a %s-month segment before consulting data", async (months) => {
    const service = new CrmService({} as never);
    await expect(service.inactiveSegment(months)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.createCampaign({ months: Number(months), couponCode: "REGRESA10", validUntil: "2027-01-01T00:00:00Z" }, "b2d06ae4-7847-4b8d-b218-0b98f950ff44", "test", null)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
