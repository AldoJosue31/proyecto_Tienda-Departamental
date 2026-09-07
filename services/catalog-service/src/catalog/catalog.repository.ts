import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

import { DatabaseService, type SqlValue } from "../database/database.service";
import type {
  CatalogBrand,
  CatalogCategory,
  CatalogProduct,
  CatalogStatus,
  CatalogVariant,
  ProductInput,
  ProductPatch,
  PublicCatalogProduct,
  ProductSearchResponse,
  SearchCriteria,
  VariantInput,
  VariantPatch,
} from "./catalog.types";

interface ProductRow {
  id: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  brand_id: string;
  brand_name: string;
  brand_slug: string;
  name: string;
  slug: string;
  description: string | null;
  tags: string[] | null;
  image_url: string | null;
  status: string;
}

interface VariantRow {
  id: string;
  product_id: string;
  sku: string;
  size: string | null;
  color: string | null;
  material: string | null;
  list_price: string | number;
  currency: string;
  status: string;
}

interface IdentifierRow {
  id: string;
}

interface VersionRow {
  value: string | number;
}

export interface CatalogMutation {
  id: string;
  catalogVersion: number;
}

const PRODUCT_COLUMNS = `
  p.id,
  p.category_id,
  c.name AS category_name,
  c.slug AS category_slug,
  p.brand_id,
  b.name AS brand_name,
  b.slug AS brand_slug,
  p.name,
  p.slug,
  p.description,
  p.tags,
  p.image_url,
  p.status
`;

const PRODUCT_JOINS = `
  FROM catalog_products p
  JOIN catalog_categories c ON c.id = p.category_id
  JOIN catalog_brands b ON b.id = p.brand_id
`;

@Injectable()
export class CatalogRepository {
  constructor(private readonly database: DatabaseService) {}

  async getCatalogVersion(): Promise<number> {
    const result = await this.database.query<VersionRow>(
      "SELECT value FROM catalog_metadata WHERE key = 'catalog_version' LIMIT 1",
    );
    const row = result.rows[0];
    const value = row ? Number(row.value) : Number.NaN;
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error("Catalog version is unavailable.");
    }
    return value;
  }

  async searchActive(criteria: SearchCriteria): Promise<ProductSearchResponse> {
    const values: SqlValue[] = [
      criteria.search,
      criteria.category,
      criteria.brand,
    ];
    const where = this.publicSearchWhere();
    const [totalResult, productsResult] = await Promise.all([
      this.database.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          ${PRODUCT_JOINS}
          ${where}
        `,
        values,
      ),
      this.database.query<ProductRow>(
        `
          SELECT ${PRODUCT_COLUMNS}
          ${PRODUCT_JOINS}
          ${where}
          ORDER BY p.name ASC, p.id ASC
          LIMIT $4 OFFSET $5
        `,
        [
          ...values,
          criteria.pageSize,
          (criteria.page - 1) * criteria.pageSize,
        ],
      ),
    ]);

    const total = Number(totalResult.rows[0]?.total ?? "0");
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new Error("Catalog search count is invalid.");
    }
    const products = await this.attachVariants(productsResult.rows, true);

    return {
      items: products.map((product) => this.toPublicProduct(product)),
      page: criteria.page,
      pageSize: criteria.pageSize,
      total,
    };
  }

  async findPublicByIdentifier(identifier: string): Promise<PublicCatalogProduct | null> {
    const result = await this.database.query<ProductRow>(
      `
        SELECT ${PRODUCT_COLUMNS}
        ${PRODUCT_JOINS}
        WHERE p.status = 'ACTIVE'
          AND (p.id::text = $1 OR p.slug = $1)
        LIMIT 1
      `,
      [identifier],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const product = (await this.attachVariants([row], true))[0];
    return product ? this.toPublicProduct(product) : null;
  }

  async findAdminById(id: string): Promise<CatalogProduct | null> {
    const result = await this.database.query<ProductRow>(
      `
        SELECT ${PRODUCT_COLUMNS}
        ${PRODUCT_JOINS}
        WHERE p.id = $1
        LIMIT 1
      `,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return (await this.attachVariants([row], false))[0] ?? null;
  }

  async findVariantById(id: string): Promise<CatalogVariant | null> {
    const result = await this.database.query<VariantRow>(
      `
        SELECT id, product_id, sku, size, color, material, list_price, currency, status
        FROM catalog_product_variants
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );
    const row = result.rows[0];
    return row ? this.mapVariant(row) : null;
  }

  async createProduct(input: ProductInput): Promise<CatalogMutation> {
    return this.database.withTransaction(async (client) => {
      const categoryId = await this.upsertCategory(client, input.category);
      const brandId = await this.upsertBrand(client, input.brand);
      const inserted = await client.query<IdentifierRow>(
        `
          INSERT INTO catalog_products (
            category_id, brand_id, name, slug, description, tags, image_url, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `,
        [
          categoryId,
          brandId,
          input.name,
          input.slug,
          input.description,
          input.tags,
          input.imageUrl,
          input.status,
        ],
      );
      const id = inserted.rows[0]?.id;
      if (!id) {
        throw new Error("Product insertion did not return an identifier.");
      }
      return { id, catalogVersion: await this.bumpCatalogVersion(client) };
    });
  }

  async updateProduct(
    identifier: string,
    patch: ProductPatch,
  ): Promise<CatalogMutation | null> {
    return this.database.withTransaction(async (client) => {
      const current = await this.findProductIdForUpdate(client, identifier);
      if (!current) {
        return null;
      }

      const assignments: string[] = [
        "catalog_version = catalog_version + 1",
        "updated_at = NOW()",
      ];
      const values: SqlValue[] = [];
      const append = (column: string, value: SqlValue): void => {
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
      };

      if (patch.name !== undefined) append("name", patch.name);
      if (patch.slug !== undefined) append("slug", patch.slug);
      if (patch.description !== undefined) append("description", patch.description);
      if (patch.tags !== undefined) append("tags", patch.tags);
      if (patch.imageUrl !== undefined) append("image_url", patch.imageUrl);
      if (patch.status !== undefined) append("status", patch.status);
      if (patch.category !== undefined) {
        append("category_id", await this.upsertCategory(client, patch.category));
      }
      if (patch.brand !== undefined) {
        append("brand_id", await this.upsertBrand(client, patch.brand));
      }

      values.push(current.id);
      await client.query(
        `
          UPDATE catalog_products
          SET ${assignments.join(", ")}
          WHERE id = $${values.length}
        `,
        values,
      );
      return {
        id: current.id,
        catalogVersion: await this.bumpCatalogVersion(client),
      };
    });
  }

  async createVariant(
    productIdentifier: string,
    input: VariantInput,
  ): Promise<CatalogMutation | null> {
    return this.database.withTransaction(async (client) => {
      const product = await this.findProductIdForUpdate(client, productIdentifier);
      if (!product) {
        return null;
      }
      const inserted = await client.query<IdentifierRow>(
        `
          INSERT INTO catalog_product_variants (
            product_id, sku, size, color, material, list_price, currency, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `,
        [
          product.id,
          input.sku,
          input.size,
          input.color,
          input.material,
          input.listPrice,
          input.currency,
          input.status,
        ],
      );
      const id = inserted.rows[0]?.id;
      if (!id) {
        throw new Error("Variant insertion did not return an identifier.");
      }
      return { id, catalogVersion: await this.bumpCatalogVersion(client) };
    });
  }

  async updateVariant(
    identifier: string,
    patch: VariantPatch,
  ): Promise<CatalogMutation | null> {
    return this.database.withTransaction(async (client) => {
      const current = await this.findVariantForUpdate(client, identifier);
      if (!current) {
        return null;
      }

      const assignments: string[] = ["updated_at = NOW()"];
      const values: SqlValue[] = [];
      const append = (column: string, value: SqlValue): void => {
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
      };

      if (patch.sku !== undefined) append("sku", patch.sku);
      if (patch.size !== undefined) append("size", patch.size);
      if (patch.color !== undefined) append("color", patch.color);
      if (patch.material !== undefined) append("material", patch.material);
      if (patch.listPrice !== undefined) append("list_price", patch.listPrice);
      if (patch.currency !== undefined) append("currency", patch.currency);
      if (patch.status !== undefined) append("status", patch.status);

      values.push(current.id);
      await client.query(
        `
          UPDATE catalog_product_variants
          SET ${assignments.join(", ")}
          WHERE id = $${values.length}
        `,
        values,
      );
      return {
        id: current.id,
        catalogVersion: await this.bumpCatalogVersion(client),
      };
    });
  }

  private publicSearchWhere(): string {
    return `
      WHERE p.status = 'ACTIVE'
        AND (
          $1::text IS NULL
          OR p.name ILIKE '%' || $1 || '%'
          OR coalesce(p.description, '') ILIKE '%' || $1 || '%'
          OR c.name ILIKE '%' || $1 || '%'
          OR b.name ILIKE '%' || $1 || '%'
          OR array_to_string(p.tags, ' ') ILIKE '%' || $1 || '%'
        )
        AND (
          $2::text IS NULL
          OR c.slug = lower($2)
          OR lower(c.name) = lower($2)
        )
        AND (
          $3::text IS NULL
          OR b.slug = lower($3)
          OR lower(b.name) = lower($3)
        )
    `;
  }

  private async attachVariants(
    products: ProductRow[],
    activeOnly: boolean,
  ): Promise<CatalogProduct[]> {
    if (products.length === 0) {
      return [];
    }
    const productIds = products.map((product) => product.id);
    const variantsResult = await this.database.query<VariantRow>(
      `
        SELECT id, product_id, sku, size, color, material, list_price, currency, status
        FROM catalog_product_variants
        WHERE product_id = ANY($1::uuid[])
          AND ($2::boolean = FALSE OR status = 'ACTIVE')
        ORDER BY product_id ASC, sku ASC
      `,
      [productIds, activeOnly],
    );
    const variantsByProduct = new Map<string, CatalogVariant[]>();
    for (const row of variantsResult.rows) {
      const variants = variantsByProduct.get(row.product_id) ?? [];
      variants.push(this.mapVariant(row));
      variantsByProduct.set(row.product_id, variants);
    }

    return products.map((row) => this.mapProduct(row, variantsByProduct.get(row.id) ?? []));
  }

  private mapProduct(row: ProductRow, variants: CatalogVariant[]): CatalogProduct {
    const status = this.toStatus(row.status);
    const category: CatalogCategory = {
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug,
    };
    const brand: CatalogBrand = {
      id: row.brand_id,
      name: row.brand_name,
      slug: row.brand_slug,
    };
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      category,
      brand,
      tags: row.tags ?? [],
      imageUrl: row.image_url,
      status,
      variants,
    };
  }

  private mapVariant(row: VariantRow): CatalogVariant {
    const listPrice = Number(row.list_price);
    if (!Number.isFinite(listPrice) || listPrice < 0) {
      throw new Error("Catalog variant price is invalid.");
    }
    const size = row.size?.trim() || null;
    const color = row.color?.trim() || null;
    const material = row.material?.trim() || null;
    const label = [size, color, material].filter((value): value is string => Boolean(value)).join(" · ") || row.sku;
    return {
      id: row.id,
      sku: row.sku,
      size,
      color,
      material,
      label,
      listPrice,
      currency: row.currency,
      status: this.toStatus(row.status),
    };
  }

  private toPublicProduct(product: CatalogProduct): ProductSearchResponse["items"][number] {
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      category: product.category,
      brand: product.brand,
      tags: product.tags,
      imageUrl: product.imageUrl,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        material: variant.material,
        label: variant.label,
        listPrice: variant.listPrice,
        currency: variant.currency,
      })),
    };
  }

  private toStatus(value: string): CatalogStatus {
    if (value === "ACTIVE" || value === "INACTIVE") {
      return value;
    }
    throw new Error("Catalog status is invalid.");
  }

  private async upsertCategory(
    client: PoolClient,
    category: ProductInput["category"],
  ): Promise<string> {
    const result = await client.query<IdentifierRow>(
      `
        INSERT INTO catalog_categories (name, slug)
        VALUES ($1, $2)
        ON CONFLICT (slug) DO UPDATE
        SET name = EXCLUDED.name, updated_at = NOW()
        RETURNING id
      `,
      [category.name, category.slug],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error("Category upsert did not return an identifier.");
    }
    return id;
  }

  private async upsertBrand(
    client: PoolClient,
    brand: ProductInput["brand"],
  ): Promise<string> {
    const result = await client.query<IdentifierRow>(
      `
        INSERT INTO catalog_brands (name, slug)
        VALUES ($1, $2)
        ON CONFLICT (slug) DO UPDATE
        SET name = EXCLUDED.name, updated_at = NOW()
        RETURNING id
      `,
      [brand.name, brand.slug],
    );
    const id = result.rows[0]?.id;
    if (!id) {
      throw new Error("Brand upsert did not return an identifier.");
    }
    return id;
  }

  private async findProductIdForUpdate(
    client: PoolClient,
    identifier: string,
  ): Promise<IdentifierRow | null> {
    const result = await client.query<IdentifierRow>(
      `
        SELECT id
        FROM catalog_products
        WHERE id::text = $1 OR slug = $1
        LIMIT 1
        FOR UPDATE
      `,
      [identifier],
    );
    return result.rows[0] ?? null;
  }

  private async findVariantForUpdate(
    client: PoolClient,
    identifier: string,
  ): Promise<IdentifierRow | null> {
    const result = await client.query<IdentifierRow>(
      `
        SELECT id
        FROM catalog_product_variants
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [identifier],
    );
    return result.rows[0] ?? null;
  }

  private async bumpCatalogVersion(client: PoolClient): Promise<number> {
    const result = await client.query<VersionRow>(
      `
        UPDATE catalog_metadata
        SET value = value + 1, updated_at = NOW()
        WHERE key = 'catalog_version'
        RETURNING value
      `,
    );
    const value = Number(result.rows[0]?.value);
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error("Catalog version increment failed.");
    }
    return value;
  }
}
