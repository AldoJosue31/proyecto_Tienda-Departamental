import { createHash } from "node:crypto";

import { calculatePrice } from "@/lib/domain/pricing";
import type { BranchId, ProductCard } from "@/lib/domain/types";
import { cacheAside, invalidatePrefix } from "@/lib/server/cache";
import { availableQuantity } from "@/lib/server/inventory-service";
import { priceRules, products } from "@/lib/server/seed-data";

export type ProductSearch = {
  query?: string;
  branchId: BranchId;
  category?: string;
};

function normalize(value?: string) {
  return value?.trim().toLocaleLowerCase("es-MX") ?? "";
}

async function toCard(product: (typeof products)[number], branchId: BranchId): Promise<ProductCard> {
  return {
    ...product,
    ...calculatePrice(product, priceRules),
    availableQuantity: await availableQuantity(product.variant.id, branchId),
  };
}

export async function searchProducts(search: ProductSearch) {
  const normalized = {
    query: normalize(search.query),
    category: normalize(search.category),
    branchId: search.branchId,
  };
  const hash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);

  return cacheAside(`products:search:${hash}:v1`, 120, () => {
    return Promise.all(products
      .filter((product) => {
        const haystack = [product.name, product.brand, product.category, ...product.tags].join(" ").toLocaleLowerCase("es-MX");
        return (!normalized.query || haystack.includes(normalized.query)) &&
          (!normalized.category || normalize(product.category) === normalized.category);
      })
      .map((product) => toCard(product, normalized.branchId)));
  });
}

export async function getProduct(productId: string, branchId: BranchId) {
  return cacheAside(`products:detail:${productId}:${branchId}:v1`, 600, () => {
    const product = products.find((item) => item.id === productId || item.slug === productId);
    return product ? toCard(product, branchId) : null;
  });
}

export async function invalidateProductCaches() {
  await invalidatePrefix("products:");
}
