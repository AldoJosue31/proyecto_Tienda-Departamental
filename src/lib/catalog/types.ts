export type CatalogStatus = "ACTIVE" | "INACTIVE";

export type CatalogReference = {
  id: string;
  name: string;
  slug: string;
};

export type CatalogVariant = {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  material: string | null;
  label: string;
  listPrice: number;
  currency: string;
  status: CatalogStatus;
};

export type CatalogProductSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: CatalogReference;
  brand: CatalogReference;
  tags: string[];
  imageUrl: string | null;
  variants: CatalogVariant[];
};

export type CatalogProductDetail = CatalogProductSummary;

export type CatalogFacet = {
  slug: string;
  name: string;
  count: number;
};

export type CatalogPage = {
  items: CatalogProductSummary[];
  page: number;
  pageSize: number;
  total: number;
  facets: {
    categories: CatalogFacet[];
    brands: CatalogFacet[];
  };
};

export type CatalogSearch = {
  search?: string;
  category?: string;
  brand?: string;
  page?: number;
  pageSize?: number;
};

export const emptyCatalogPage: CatalogPage = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
  facets: { categories: [], brands: [] },
};
