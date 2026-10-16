import { afterEach, describe, expect, it, vi } from "vitest";
import { PricingService } from "../src/pricing/pricing.service";
import { BatchQuoteService } from "../src/pricing/batch-quote.service";

const productId = "a1000000-0000-4000-8000-000000000001", variantId = "a2000000-0000-4000-8000-000000000001";
const item = { productId, variantId, quantity: 2 };
afterEach(() => vi.unstubAllGlobals());
describe("batch pricing uses authoritative catalog and temporal boundaries", () => {
  it("resolves a page with one Catalog request and ignores caller price fields", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ products: [{ id: productId, category: { id: productId }, variants: [{ id: variantId, listPrice: 100, currency: "MXN" }] }] }) });
    vi.stubGlobal("fetch", fetcher);
    const service = new BatchQuoteService({} as never, { catalogServiceUrl: "http://catalog" });
    const lines = await service.resolve([{ ...item, basePrice: 1 } as typeof item]);
    expect(lines[0]?.basePrice).toBe(100);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ ids: [productId] });
  });
  it("rejects an unavailable variant and duplicate lines", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ products: [] }) }));
    const service = new BatchQuoteService({} as never, { catalogServiceUrl: "http://catalog" });
    await expect(service.resolve([item])).rejects.toMatchObject({ code: "CATALOG_ITEM_UNAVAILABLE" });
    await expect(service.resolve([item, item])).rejects.toMatchObject({ code: "DUPLICATE_VARIANT" });
  });
  it("prices all lines in one SQL query and invalidates at midnight and expiry", async () => {
    const starts = new Date("2026-10-14T06:00:00.000Z"), ends = new Date("2026-10-14T07:00:00.000Z");
    const query = vi.fn().mockResolvedValue({ rows: [{ id: productId, name: "Venta Nocturna", priority: 10, status: "SCHEDULED", discount_type: "PERCENTAGE", discount_value: 20, starts_at: starts, ends_at: ends, targets: [{ scope: "ALL", targetId: null }] }] });
    const pricing = new PricingService({ query } as never, {} as never, { environment: "test", schedulerIntervalSeconds: 30 });
    const input = { ...item, basePrice: 100, currency: "MXN" };
    const before = await pricing.quoteMany([input, { ...input, variantId: productId }], new Date(starts.getTime() - 1));
    expect(query).toHaveBeenCalledTimes(1);
    expect(before.quotes.map(quote => quote.effectivePrice)).toEqual([100, 100]);
    expect(before.validUntil).toBe(starts.toISOString());
    expect((await pricing.quoteMany([input], starts)).quotes[0]?.effectivePrice).toBe(80);
    expect((await pricing.quoteMany([input], ends)).quotes[0]?.effectivePrice).toBe(100);
  });
});
