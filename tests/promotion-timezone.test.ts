import { describe, expect, it } from "vitest";
import { zonedDateTimeToUtc, utcToZonedDateTime } from "@/lib/pricing/zoned-date-time";
import { promotionInputSchema } from "@/lib/pricing/promotions-schema";

describe("promotion campaign timezone", () => {
  it("starts Mexico City's midnight at 06:00 UTC independently of the device zone", () => {
    const original = process.env.TZ;
    try {
      for (const zone of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
        process.env.TZ = zone;
        expect(zonedDateTimeToUtc("2026-10-09T00:00", "America/Mexico_City")).toBe("2026-10-09T06:00:00.000Z");
      }
    } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
  });
  it("converts a saved instant back to the campaign's wall clock", () => {
    expect(utcToZonedDateTime("2026-10-09T06:00:00Z", "America/Mexico_City")).toBe("2026-10-09T00:00");
  });
  it("rejects nonexistent and repeated DST hours rather than shifting the campaign", () => {
    expect(() => zonedDateTimeToUtc("2026-03-08T02:30", "America/New_York")).toThrow();
    expect(() => zonedDateTimeToUtc("2026-11-01T01:30", "America/New_York")).toThrow();
    expect(zonedDateTimeToUtc("2026-03-08T03:30", "America/New_York")).toBe("2026-03-08T07:30:00.000Z");
  });
  it("rejects calendar rollover and invalid zones", () => {
    expect(() => zonedDateTimeToUtc("2026-02-30T00:00", "UTC")).toThrow();
    expect(() => zonedDateTimeToUtc("2026-10-09T00:00", "Invalid/Zone")).toThrow();
  });
  it("requires explicit offsets in API input", () => {
    const input = { name: "Venta Nocturna", discountType: "PERCENTAGE", discountValue: 10, priority: 0, timezone: "America/Mexico_City", targets: [{ scope: "ALL" }], startsAt: "2026-10-09T00:00:00", endsAt: "2026-10-10T06:00:00Z" };
    expect(promotionInputSchema.safeParse(input).success).toBe(false);
    expect(promotionInputSchema.safeParse({ ...input, startsAt: "2026-10-09T00:00:00-06:00" }).success).toBe(true);
  });
});
