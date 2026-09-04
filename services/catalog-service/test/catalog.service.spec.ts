import { describe, expect, it, vi } from "vitest";

import type { CacheService } from "../src/cache/cache.service";
import { CatalogRepository } from "../src/catalog/catalog.repository";
import { CatalogService } from "../src/catalog/catalog.service";
import type {
  CatalogProduct,
  CatalogVariant,
  ProductSearchResponse,
} from "../src/catalog/catalog.types";

const publicSearch: ProductSearchResponse = {
  items: [
    {
      id: "a1000000-0000-4000-8000-000000000001",
      slug: "smart-tv-aurora-55",
      name: "Smart TV Aurora 55\" 4K",
      description: "Panel 4K",
      category: { id: "category-id", name: "Electrónica", slug: "electronica" },
      brand: { id: "brand-id", name: "Aurora", slug: "aurora" },
      tags: ["4K"],
      imageUrl: "/catalog/departmental-products-v1.png",
      variants: [
        {
          id: "a2000000-0000-4000-8000-000000000001",
          sku: "AUR-55-4K",
          size: "55 pulgadas",
          color: null,
          material: null,
          label: "55 pulgadas",
          listPrice: 12_999,
          currency: "MXN",
        },
      ],
    },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
};

const adminProduct: CatalogProduct = {
  ...publicSearch.items[0]!,
  status: "ACTIVE",
  variants: [
    {
      ...publicSearch.items[0]!.variants[0]!,
      status: "ACTIVE",
    },
  ],
};

const inactiveVariant: CatalogVariant = {
  ...adminProduct.variants[0]!,
  status: "INACTIVE",
};

function createService() {
  const repository = {
    getCatalogVersion: vi.fn().mockResolvedValue(1),
    searchActive: vi.fn().mockResolvedValue(publicSearch),
    findPublicByIdentifier: vi.fn().mockResolvedValue(publicSearch.items[0]),
    findAdminById: vi.fn().mockResolvedValue(adminProduct),
    findVariantById: vi.fn().mockResolvedValue(inactiveVariant),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    createVariant: vi.fn(),
    updateVariant: vi.fn(),
  } as unknown as CatalogRepository;
  const cache = {
    getString: vi.fn().mockResolvedValue(null),
    setString: vi.fn().mockResolvedValue(undefined),
    getJson: vi.fn().mockResolvedValue(null),
    setJson: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue("ready"),
  } as unknown as CacheService;

  return {
    service: new CatalogService(repository, cache, {
      searchCacheTtlSeconds: 120,
      productCacheTtlSeconds: 600,
    }),
    repository,
    cache,
  };
}

describe("CatalogService", () => {
  it("serves a valid cached search without reading PostgreSQL", async () => {
    const { service, repository, cache } = createService();
    vi.mocked(cache.getString).mockResolvedValue("7");
    vi.mocked(cache.getJson).mockResolvedValue(publicSearch);

    await expect(service.search({})).resolves.toEqual(publicSearch);
    expect(vi.mocked(repository.getCatalogVersion)).not.toHaveBeenCalled();
    expect(vi.mocked(repository.searchActive)).not.toHaveBeenCalled();
  });

  it("loads a cache miss from PostgreSQL and stores a normalized search response", async () => {
    const { service, repository, cache } = createService();
    vi.mocked(repository.getCatalogVersion).mockResolvedValue(9);

    const response = await service.search({
      search: "  AURORA ",
      page: 1,
      pageSize: 20,
    });

    expect(response).toEqual(publicSearch);
    expect(vi.mocked(repository.searchActive)).toHaveBeenCalledWith({
      search: "aurora",
      category: null,
      brand: null,
      page: 1,
      pageSize: 20,
    });
    expect(vi.mocked(cache.setJson)).toHaveBeenCalledWith(
      expect.stringMatching(/^catalog:search:v9:/),
      publicSearch,
      120,
    );
  });

  it("advances the versioned cache after an ADMIN product mutation", async () => {
    const { service, repository, cache } = createService();
    vi.mocked(repository.createProduct).mockResolvedValue({
      id: adminProduct.id,
      catalogVersion: 4,
    });

    const result = await service.createProduct({
      name: adminProduct.name,
      category: { name: "Electrónica", slug: "electronica" },
      brand: { name: "Aurora", slug: "aurora" },
    });

    expect(result).toEqual({ product: adminProduct });
    expect(vi.mocked(cache.setString)).toHaveBeenCalledWith(
      "catalog:version",
      "4",
      86_400,
    );
  });

  it("maps a duplicate SKU to the documented conflict response", async () => {
    const { service, repository } = createService();
    vi.mocked(repository.createVariant).mockRejectedValue({
      code: "23505",
      constraint: "catalog_product_variants_sku_key",
    });

    await expect(
      service.createVariant(adminProduct.id, {
        sku: "AUR-55-4K",
        listPrice: 12_999,
      }),
    ).rejects.toMatchObject({
      code: "DUPLICATE_SKU",
      status: 409,
    });
  });

  it("allows a variant to be deactivated instead of physically deleting it", async () => {
    const { service, repository } = createService();
    vi.mocked(repository.updateVariant).mockResolvedValue({
      id: inactiveVariant.id,
      catalogVersion: 5,
    });

    await expect(
      service.updateVariant(inactiveVariant.id, { status: "INACTIVE" }),
    ).resolves.toEqual({ variant: inactiveVariant });
    expect(vi.mocked(repository.updateVariant)).toHaveBeenCalledWith(
      inactiveVariant.id,
      { status: "INACTIVE" },
    );
  });
});
