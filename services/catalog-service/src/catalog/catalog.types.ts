export const CATALOG_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
}

export interface CatalogBrand {
  id: string;
  name: string;
  slug: string;
}

export interface CatalogVariant {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  material: string | null;
  label: string;
  listPrice: number;
  currency: string;
  status: CatalogStatus;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: CatalogCategory;
  brand: CatalogBrand;
  tags: string[];
  imageUrl: string | null;
  status: CatalogStatus;
  variants: CatalogVariant[];
}

export interface PublicCatalogProduct extends Omit<CatalogProduct, "status" | "variants"> {
  variants: Array<Omit<CatalogVariant, "status">>;
}

export interface ProductSearchResponse {
  items: PublicCatalogProduct[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ProductDetailResponse {
  product: PublicCatalogProduct;
}

export interface AdminProductResponse {
  product: CatalogProduct;
}

export interface AdminVariantResponse {
  variant: CatalogVariant;
}

export interface SearchCriteria {
  search: string | null;
  category: string | null;
  brand: string | null;
  page: number;
  pageSize: number;
}

export interface ProductInput {
  name: string;
  slug: string;
  description: string | null;
  category: { name: string; slug: string };
  brand: { name: string; slug: string };
  tags: string[];
  imageUrl: string | null;
  status: CatalogStatus;
}

export interface ProductPatch {
  name?: string;
  slug?: string;
  description?: string | null;
  category?: { name: string; slug: string };
  brand?: { name: string; slug: string };
  tags?: string[];
  imageUrl?: string | null;
  status?: CatalogStatus;
}

export interface VariantInput {
  sku: string;
  size: string | null;
  color: string | null;
  material: string | null;
  listPrice: number;
  currency: string;
  status: CatalogStatus;
}

export interface VariantPatch {
  sku?: string;
  size?: string | null;
  color?: string | null;
  material?: string | null;
  listPrice?: number;
  currency?: string;
  status?: CatalogStatus;
}
