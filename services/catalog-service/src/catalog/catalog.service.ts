import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";

import { CATALOG_RUNTIME_CONFIG } from "../auth/token.service";
import { CacheService } from "../cache/cache.service";
import { ApiException } from "../common/api-exception";
import type { CatalogRuntimeConfig } from "../config/environment";
import type {
  CreateProductDto,
  CreateVariantDto,
  ProductSearchDto,
  UpdateProductDto,
  UpdateVariantDto,
} from "./catalog.dto";
import { CatalogRepository, type CatalogMutation } from "./catalog.repository";
import type {
  AdminProductResponse,
  AdminVariantResponse,
  ProductDetailResponse,
  ProductInput,
  ProductPatch,
  ProductSearchResponse,
  SearchCriteria,
  VariantInput,
  VariantPatch,
} from "./catalog.types";

const CACHE_VERSION_KEY = "catalog:version";
const CACHE_VERSION_TTL_SECONDS = 86_400;

interface PostgresError {
  code?: unknown;
  constraint?: unknown;
}

@Injectable()
export class CatalogService {
  private catalogVersion: number | null = null;

  constructor(
    private readonly repository: CatalogRepository,
    private readonly cache: CacheService,
    @Inject(CATALOG_RUNTIME_CONFIG)
    private readonly config: Pick<CatalogRuntimeConfig, "searchCacheTtlSeconds" | "productCacheTtlSeconds">,
  ) {}

  async search(query: ProductSearchDto): Promise<ProductSearchResponse> {
    const criteria = this.toSearchCriteria(query);
    const catalogVersion = await this.currentCatalogVersion();
    const cacheKey = this.cacheKey("search", catalogVersion, criteria);
    const cached = await this.cache.getJson<ProductSearchResponse>(cacheKey);
    if (cached && this.isSearchResponse(cached, criteria)) {
      return cached;
    }

    const response = await this.repository.searchActive(criteria);
    await this.cache.setJson(cacheKey, response, this.config.searchCacheTtlSeconds);
    return response;
  }

  async getPublicProduct(identifier: string): Promise<ProductDetailResponse> {
    const normalizedIdentifier = this.normalizeIdentifier(identifier);
    const catalogVersion = await this.currentCatalogVersion();
    const cacheKey = this.cacheKey("product", catalogVersion, normalizedIdentifier);
    const cached = await this.cache.getJson<ProductDetailResponse>(cacheKey);
    if (cached && this.isProductDetailResponse(cached)) {
      return cached;
    }

    const product = await this.repository.findPublicByIdentifier(normalizedIdentifier);
    if (!product) {
      throw new ApiException(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
    }
    const response = { product };
    await this.cache.setJson(cacheKey, response, this.config.productCacheTtlSeconds);
    return response;
  }

  async createProduct(body: CreateProductDto): Promise<AdminProductResponse> {
    const mutation = await this.performMutation(() => this.repository.createProduct(
      this.toProductInput(body),
    ));
    if (!mutation) {
      throw new Error("Product creation did not return a mutation result.");
    }
    return this.adminProductResponse(mutation.id);
  }

  async updateProduct(
    identifier: string,
    body: UpdateProductDto,
  ): Promise<AdminProductResponse> {
    const patch = this.toProductPatch(body);
    if (Object.keys(patch).length === 0) {
      throw new ApiException(400, "VALIDATION_ERROR", "Incluye al menos un campo para actualizar");
    }
    const mutation = await this.performMutation(() => this.repository.updateProduct(
      this.normalizeIdentifier(identifier),
      patch,
    ));
    if (!mutation) {
      throw new ApiException(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
    }
    return this.adminProductResponse(mutation.id);
  }

  async createVariant(
    productIdentifier: string,
    body: CreateVariantDto,
  ): Promise<AdminVariantResponse> {
    const mutation = await this.performMutation(() => this.repository.createVariant(
      this.normalizeIdentifier(productIdentifier),
      this.toVariantInput(body),
    ));
    if (!mutation) {
      throw new ApiException(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
    }
    return this.adminVariantResponse(mutation.id);
  }

  async updateVariant(
    identifier: string,
    body: UpdateVariantDto,
  ): Promise<AdminVariantResponse> {
    const patch = this.toVariantPatch(body);
    if (Object.keys(patch).length === 0) {
      throw new ApiException(400, "VALIDATION_ERROR", "Incluye al menos un campo para actualizar");
    }
    const mutation = await this.performMutation(() => this.repository.updateVariant(
      this.normalizeIdentifier(identifier),
      patch,
    ));
    if (!mutation) {
      throw new ApiException(404, "VARIANT_NOT_FOUND", "Variante no encontrada");
    }
    return this.adminVariantResponse(mutation.id);
  }

  private async adminProductResponse(id: string): Promise<AdminProductResponse> {
    const product = await this.repository.findAdminById(id);
    if (!product) {
      throw new Error("Product is missing immediately after its mutation.");
    }
    return { product };
  }

  private async adminVariantResponse(id: string): Promise<AdminVariantResponse> {
    const variant = await this.repository.findVariantById(id);
    if (!variant) {
      throw new Error("Variant is missing immediately after its mutation.");
    }
    return { variant };
  }

  private async performMutation(
    operation: () => Promise<CatalogMutation | null>,
  ): Promise<CatalogMutation | null> {
    try {
      const mutation = await operation();
      if (mutation) {
        this.catalogVersion = mutation.catalogVersion;
        // Versioned keys are logically invalidated at commit. Old entries expire
        // naturally and are never selected by future reads.
        await this.cache.setString(
          CACHE_VERSION_KEY,
          String(mutation.catalogVersion),
          CACHE_VERSION_TTL_SECONDS,
        );
      }
      return mutation;
    } catch (error) {
      throw this.translateConstraint(error);
    }
  }

  private translateConstraint(error: unknown): unknown {
    if (!this.isPostgresUniqueViolation(error)) {
      return error;
    }
    const constraint = error.constraint;
    if (constraint === "catalog_product_variants_sku_key") {
      return new ApiException(409, "DUPLICATE_SKU", "El SKU ya está registrado");
    }
    if (constraint === "catalog_products_slug_key") {
      return new ApiException(409, "DUPLICATE_PRODUCT_SLUG", "El slug del producto ya está registrado");
    }
    return new ApiException(409, "CONFLICT", "La operación no se puede completar");
  }

  private isPostgresUniqueViolation(error: unknown): error is PostgresError & {
    code: "23505";
    constraint: string;
  } {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as PostgresError).code === "23505" &&
      typeof (error as PostgresError).constraint === "string"
    );
  }

  private async currentCatalogVersion(): Promise<number> {
    const cachedVersion = this.parseVersion(await this.cache.getString(CACHE_VERSION_KEY));
    if (cachedVersion !== null) {
      this.catalogVersion = cachedVersion;
      return cachedVersion;
    }
    if (this.catalogVersion !== null && this.cache.getStatus() !== "ready") {
      return this.catalogVersion;
    }

    const databaseVersion = await this.repository.getCatalogVersion();
    this.catalogVersion = databaseVersion;
    await this.cache.setString(
      CACHE_VERSION_KEY,
      String(databaseVersion),
      CACHE_VERSION_TTL_SECONDS,
    );
    return databaseVersion;
  }

  private parseVersion(value: string | null): number | null {
    if (!value || !/^\d+$/.test(value)) {
      return null;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private toSearchCriteria(query: ProductSearchDto): SearchCriteria {
    return {
      search: this.normalizedSearchValue(query.search),
      category: this.normalizedSearchValue(query.category),
      brand: this.normalizedSearchValue(query.brand),
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  private normalizedSearchValue(value: string | undefined): string | null {
    const normalized = value?.trim().toLocaleLowerCase("es-MX");
    return normalized || null;
  }

  private toProductInput(body: CreateProductDto): ProductInput {
    return {
      name: body.name,
      slug: body.slug ?? this.slugify(body.name),
      description: body.description?.trim() || null,
      category: this.toNamedReference(body.category),
      brand: this.toNamedReference(body.brand),
      tags: this.normalizeTags(body.tags ?? []),
      imageUrl: body.imageUrl?.trim() || null,
      status: body.status ?? "ACTIVE",
    };
  }

  private toProductPatch(body: UpdateProductDto): ProductPatch {
    const patch: ProductPatch = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.slug !== undefined) patch.slug = body.slug;
    if (body.description !== undefined) patch.description = body.description?.trim() || null;
    if (body.category !== undefined) patch.category = this.toNamedReference(body.category);
    if (body.brand !== undefined) patch.brand = this.toNamedReference(body.brand);
    if (body.tags !== undefined) patch.tags = this.normalizeTags(body.tags);
    if (body.imageUrl !== undefined) patch.imageUrl = body.imageUrl?.trim() || null;
    if (body.status !== undefined) patch.status = body.status;
    return patch;
  }

  private toVariantInput(body: CreateVariantDto): VariantInput {
    return {
      sku: body.sku,
      size: this.optionalText(body.size),
      color: this.optionalText(body.color),
      material: this.optionalText(body.material),
      listPrice: body.listPrice,
      currency: body.currency ?? "MXN",
      status: body.status ?? "ACTIVE",
    };
  }

  private toVariantPatch(body: UpdateVariantDto): VariantPatch {
    const patch: VariantPatch = {};
    if (body.sku !== undefined) patch.sku = body.sku;
    if (body.size !== undefined) patch.size = this.optionalText(body.size);
    if (body.color !== undefined) patch.color = this.optionalText(body.color);
    if (body.material !== undefined) patch.material = this.optionalText(body.material);
    if (body.listPrice !== undefined) patch.listPrice = body.listPrice;
    if (body.currency !== undefined) patch.currency = body.currency;
    if (body.status !== undefined) patch.status = body.status;
    return patch;
  }

  private toNamedReference(reference: { name: string; slug?: string }): { name: string; slug: string } {
    return {
      name: reference.name,
      slug: reference.slug ?? this.slugify(reference.name),
    };
  }

  private normalizeTags(tags: string[]): string[] {
    const normalized = new Map<string, string>();
    for (const tag of tags) {
      const clean = tag.trim();
      if (clean) {
        normalized.set(clean.toLocaleLowerCase("es-MX"), clean);
      }
    }
    return [...normalized.values()];
  }

  private optionalText(value: string | null | undefined): string | null {
    return value?.trim() || null;
  }

  private normalizeIdentifier(value: string): string {
    const identifier = value.trim();
    if (!identifier || identifier.length > 220) {
      throw new ApiException(404, "PRODUCT_NOT_FOUND", "Producto no encontrado");
    }
    return identifier;
  }

  private slugify(value: string): string {
    const slug = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es-MX")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 220)
      .replace(/-+$/g, "");
    if (!slug) {
      throw new ApiException(400, "VALIDATION_ERROR", "No se pudo generar un slug válido");
    }
    return slug;
  }

  private cacheKey(
    kind: "search" | "product",
    catalogVersion: number,
    input: SearchCriteria | string,
  ): string {
    const digest = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("base64url");
    return `catalog:${kind}:v${catalogVersion}:${digest}`;
  }

  private isSearchResponse(
    response: ProductSearchResponse,
    criteria: SearchCriteria,
  ): boolean {
    return (
      Array.isArray(response.items) &&
      response.page === criteria.page &&
      response.pageSize === criteria.pageSize &&
      Number.isSafeInteger(response.total) &&
      response.total >= 0
    );
  }

  private isProductDetailResponse(response: ProductDetailResponse): boolean {
    return Boolean(
      response.product &&
      typeof response.product.id === "string" &&
      typeof response.product.slug === "string" &&
      Array.isArray(response.product.variants),
    );
  }
}
