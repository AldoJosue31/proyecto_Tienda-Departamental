import type { CatalogPage, CatalogSearch } from "@/lib/catalog/types";

const defaultGatewayUrl = "http://localhost:8000";
const catalogRequestTimeoutMs = 4_000;

export class CatalogRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly correlationId: string,
  ) {
    super(message);
    this.name = "CatalogRequestError";
  }
}

function publicGatewayUrl(): string {
  return (process.env.NEXT_PUBLIC_GATEWAY_URL ?? defaultGatewayUrl).replace(/\/$/, "");
}

function makeCorrelationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `catalog-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildSearchParams(search: CatalogSearch): string {
  const params = new URLSearchParams();
  if (search.search?.trim()) params.set("search", search.search.trim());
  if (search.category?.trim()) params.set("category", search.category.trim());
  if (search.brand?.trim()) params.set("brand", search.brand.trim());
  params.set("page", String(search.page ?? 1));
  params.set("pageSize", String(search.pageSize ?? 20));
  return params.toString();
}

export async function searchCatalog(search: CatalogSearch, signal?: AbortSignal): Promise<CatalogPage> {
  const correlationId = makeCorrelationId();
  const controller = new AbortController();
  let timeout: number | undefined;
  const abortFromQuery = () => controller.abort();
  signal?.addEventListener("abort", abortFromQuery, { once: true });
  let response: Response;

  try {
    const request = fetch(`${publicGatewayUrl()}/products?${buildSearchParams(search)}`, {
      signal: controller.signal,
      headers: { "X-Correlation-Id": correlationId },
    });
    const deadline = new Promise<never>((_, reject) => {
      timeout = window.setTimeout(() => {
        controller.abort();
        reject(new CatalogRequestError("El catálogo tardó demasiado en responder.", 503, correlationId));
      }, catalogRequestTimeoutMs);
    });
    response = await Promise.race([request, deadline]);
  } catch (error) {
    if (error instanceof CatalogRequestError) throw error;
    throw new CatalogRequestError("No fue posible contactar el catálogo.", 503, correlationId);
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromQuery);
  }

  const responseCorrelationId = response.headers.get("X-Correlation-Id") ?? correlationId;
  const body = await response.json().catch(() => null) as (CatalogPage & { message?: string }) | null;

  if (!response.ok || !body) {
    throw new CatalogRequestError(
      body?.message ?? "No fue posible actualizar el catálogo.",
      response.status,
      responseCorrelationId,
    );
  }

  return body;
}
