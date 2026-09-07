import "server-only";

import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";
import type { CatalogPage, CatalogSearch } from "@/lib/catalog/types";

function buildSearchParams(search: CatalogSearch): string {
  const params = new URLSearchParams();
  if (search.search?.trim()) params.set("search", search.search.trim());
  if (search.category?.trim()) params.set("category", search.category.trim());
  if (search.brand?.trim()) params.set("brand", search.brand.trim());
  params.set("page", String(search.page ?? 1));
  params.set("pageSize", String(search.pageSize ?? 20));
  return params.toString();
}

export async function getCatalogPage(search: CatalogSearch = {}): Promise<CatalogPage> {
  const { body, correlationId, response } = await gatewayJson<CatalogPage & { message?: string }>(
    `/products?${buildSearchParams(search)}`,
  );

  if (!response.ok) {
    throw new GatewayRequestError(
      body.message ?? "No fue posible cargar el catálogo.",
      response.status,
      correlationId,
    );
  }

  return body;
}
