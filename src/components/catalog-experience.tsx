"use client";

import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconRefresh,
  IconSearch,
  IconTag,
  IconX,
} from "@tabler/icons-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { searchCatalog } from "@/lib/catalog/catalog-client";
import type { CatalogPage, CatalogProductSummary } from "@/lib/catalog/types";

type CatalogExperienceProps = {
  initialPage: CatalogPage;
  initialError?: boolean;
};

const spritePositionBySlug: Record<string, string> = {
  "smart-tv-aurora-55": "0% 0%",
  "audifonos-nova-anc": "50% 0%",
  "lampara-lumen-mesa": "100% 0%",
  "tenis-kinetic-run": "0% 100%",
  "silla-atelier": "50% 100%",
  "reloj-vertex-fit": "100% 100%",
};

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function visibleAttributes(product: CatalogProductSummary) {
  return product.variants.flatMap((variant) => [variant.size, variant.color, variant.material].filter(Boolean) as string[]);
}

function ProductMedia({ product, compact = false }: { product: CatalogProductSummary; compact?: boolean }) {
  const spritePosition = spritePositionBySlug[product.slug];
  const source = product.imageUrl;
  const style = source?.includes("departmental-products-v1.png")
    ? {
      backgroundImage: `url("${source}")`,
      backgroundPosition: spritePosition ?? "50% 50%",
      backgroundSize: "300% 200%",
    }
    : source
      ? { backgroundImage: `url("${source}")`, backgroundSize: "cover", backgroundPosition: "center" }
      : undefined;

  return (
    <div
      role="img"
      aria-label={`Imagen de ${product.name}`}
      className={`${compact ? "aspect-square" : "aspect-[3/4]"} grid overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] bg-no-repeat ${style ? "" : "place-items-center bg-[linear-gradient(145deg,var(--accent-soft),var(--surface-muted))]"}`}
      style={style}
    >
      {!style && <span aria-hidden="true" className="text-3xl font-semibold tracking-[-0.06em] text-[var(--accent-strong)]">{product.name.slice(0, 1)}</span>}
    </div>
  );
}

function PriceHint({ product }: { product: CatalogProductSummary }) {
  const prices = product.variants.map((variant) => variant.listPrice).filter((price) => Number.isFinite(price));
  const currency = product.variants[0]?.currency ?? "MXN";
  if (!prices.length) return <p className="text-sm font-medium text-[var(--muted)]">Sin variantes activas</p>;
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  return (
    <div>
      <p className="text-xs font-medium text-[var(--muted)]">Precio base</p>
      <p className="mt-0.5 text-lg font-semibold tracking-[-0.025em]">
        {minimum === maximum ? money(minimum, currency) : `Desde ${money(minimum, currency)}`}
      </p>
    </div>
  );
}

export function CatalogExperience({ initialPage, initialError = false }: CatalogExperienceProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [requestedPage, setRequestedPage] = useState(initialPage.page);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProductSummary | null>(null);
  const detailDialogRef = useRef<HTMLDialogElement>(null);
  const deferredSearch = useDeferredValue(search);

  const categories = useMemo(
    () => Array.from(new Map(initialPage.items.map((product) => [product.category.slug, product.category.name])).entries()),
    [initialPage.items],
  );
  const brands = useMemo(
    () => Array.from(new Map(initialPage.items.map((product) => [product.brand.slug, product.brand.name])).entries()),
    [initialPage.items],
  );
  const catalogSearch = useMemo(() => ({
    search: deferredSearch,
    category,
    brand,
    page: requestedPage,
    pageSize: 20,
  }), [brand, category, deferredSearch, requestedPage]);
  const catalogQuery = useQuery({
    queryKey: ["catalog", catalogSearch],
    queryFn: ({ signal }) => searchCatalog(catalogSearch, signal),
    initialData: initialError ? undefined : initialPage,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const page = catalogQuery.data ?? initialPage;
  const catalogError = catalogQuery.isError || (initialError && !catalogQuery.data)
    ? "No pudimos actualizar el catálogo. Conservamos los últimos resultados mientras reintentas."
    : null;
  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize));

  useEffect(() => {
    const dialog = detailDialogRef.current;
    if (!dialog) return;
    if (selectedProduct && !dialog.open) dialog.showModal();
    if (!selectedProduct && dialog.open) dialog.close();
  }, [selectedProduct]);

  function resetPage() {
    setRequestedPage(1);
  }

  return (
    <>

      <section className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="grid items-end gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-[var(--accent-strong)]">Catálogo departamental</p>
            <h1 className="mt-2 text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Encuentra la variante exacta para ti.</h1>
            <p className="mt-3 max-w-xl text-pretty text-base leading-7 text-[var(--muted)]">Consulta productos, marcas y variantes. El precio final y la disponibilidad por sucursal se confirmarán antes de comprar.</p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
            <span className="font-semibold text-[var(--ink)]">{page.total}</span> productos publicados
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3" aria-label="Filtros del catálogo" aria-busy={catalogQuery.isFetching}>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
            <label className="relative block">
              <span className="sr-only">Buscar productos</span>
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={19} stroke={1.75} aria-hidden="true" />
              <input value={search} onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder="Buscar productos, marcas o categorías" className="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] pl-10 pr-3 text-sm transition-colors focus:border-[var(--accent)] focus:outline-none" />
            </label>
            <label className="relative block">
              <span className="sr-only">Categoría</span>
              <select value={category} onChange={(event) => { setCategory(event.target.value); resetPage(); }} className="h-11 w-full appearance-none rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm transition-colors focus:border-[var(--accent)] focus:outline-none">
                <option value="">Todas las categorías</option>
                {categories.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
              </select>
            </label>
            <label className="relative block">
              <span className="sr-only">Marca</span>
              <select value={brand} onChange={(event) => { setBrand(event.target.value); resetPage(); }} className="h-11 w-full appearance-none rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm transition-colors focus:border-[var(--accent)] focus:outline-none">
                <option value="">Todas las marcas</option>
                {brands.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
              </select>
            </label>
          </div>
        </section>

        {catalogError && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-surface)] px-4 py-3 text-sm text-[var(--ink)]" role="alert"><span className="flex items-center gap-2"><IconAlertTriangle size={18} className="text-[var(--danger)]" aria-hidden="true" />{catalogError}</span><button type="button" onClick={() => { void catalogQuery.refetch(); }} className="inline-flex min-h-10 items-center gap-2 font-semibold text-[var(--danger)] underline decoration-1 underline-offset-4"><IconRefresh size={16} aria-hidden="true" />Reintentar</button></div>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3" aria-live="polite">
          <p className="text-sm text-[var(--muted)]">{catalogQuery.isFetching ? "Actualizando catálogo…" : `${page.items.length} resultados en esta página`}</p>
          {(search || category || brand) && <button type="button" onClick={() => { setSearch(""); setCategory(""); setBrand(""); setRequestedPage(1); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]"><IconX size={16} aria-hidden="true" />Limpiar filtros</button>}
        </div>

        {page.items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] px-6 py-16 text-center"><IconSearch className="mx-auto text-[var(--muted)]" size={30} stroke={1.5} aria-hidden="true" /><h2 className="mt-3 font-semibold">No encontramos coincidencias</h2><p className="mt-1 text-sm text-[var(--muted)]">Prueba con otra búsqueda, categoría o marca.</p></div>
        ) : (
          <div className="mt-7 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {page.items.map((product) => {
              const attributes = Array.from(new Set(visibleAttributes(product))).slice(0, 3);
              return <article key={product.id} className="group min-w-0"><ProductMedia product={product} /><div className="mt-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-[var(--muted)]">{product.brand.name}</p><h2 className="mt-1 text-base font-semibold tracking-[-0.02em]">{product.name}</h2></div><span className="shrink-0 rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--accent-strong)]">{product.category.name}</span></div><p className="mt-2 min-h-10 text-sm leading-5 text-[var(--muted)]">{product.description ?? "Conoce las opciones disponibles de este producto."}</p><div className="mt-4 flex items-end justify-between gap-3 border-t border-[var(--line)] pt-3"><PriceHint product={product} /><p className="text-right text-xs font-semibold text-[var(--muted)]">{product.variants.length} {product.variants.length === 1 ? "variante" : "variantes"}</p></div>{attributes.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{attributes.map((attribute) => <span key={attribute} className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-xs text-[var(--muted)]">{attribute}</span>)}</div>}<button type="button" onClick={() => setSelectedProduct(product)} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-3 text-sm font-semibold text-[var(--surface)] transition-colors hover:bg-[var(--accent-strong)]"><IconTag size={17} stroke={2} aria-hidden="true" />Ver variantes</button></div></article>;
            })}
          </div>
        )}

        {page.total > page.pageSize && <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Paginación del catálogo"><button type="button" disabled={page.page <= 1 || catalogQuery.isFetching} onClick={() => setRequestedPage(page.page - 1)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[var(--line)] px-3 text-sm font-semibold transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-45"><IconChevronLeft size={17} aria-hidden="true" />Anterior</button><p className="text-sm text-[var(--muted)]">Página <span className="font-semibold text-[var(--ink)]">{page.page}</span> de {totalPages}</p><button type="button" disabled={page.page >= totalPages || catalogQuery.isFetching} onClick={() => setRequestedPage(page.page + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[var(--line)] px-3 text-sm font-semibold transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-45">Siguiente<IconChevronRight size={17} aria-hidden="true" /></button></nav>}
      </section>


      <dialog ref={detailDialogRef} onClose={() => setSelectedProduct(null)} aria-labelledby="product-dialog-title" className="w-[min(46rem,calc(100vw-2rem))] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-0 text-[var(--ink)] shadow-2xl backdrop:bg-black/35">
        {selectedProduct && <div className="grid gap-6 p-5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:p-6"><ProductMedia product={selectedProduct} compact /><div><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[var(--accent-strong)]">{selectedProduct.brand.name} · {selectedProduct.category.name}</p><h2 id="product-dialog-title" className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{selectedProduct.name}</h2></div><button type="button" onClick={() => detailDialogRef.current?.close()} aria-label="Cerrar detalle" className="grid size-10 shrink-0 place-items-center rounded-xl text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"><IconX size={20} aria-hidden="true" /></button></div><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{selectedProduct.description ?? "Revisa las variantes disponibles de este producto."}</p><div className="mt-5 border-y border-[var(--line)] py-4"><p className="text-sm font-semibold">Variantes disponibles</p><div className="mt-3 space-y-2">{selectedProduct.variants.map((variant) => <div key={variant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-muted)] px-3 py-2.5"><div><p className="text-sm font-semibold">{variant.label}</p><p className="mt-0.5 text-xs text-[var(--muted)]">SKU {variant.sku}</p></div><p className="text-sm font-semibold">{money(variant.listPrice, variant.currency)}</p></div>)}</div></div><p className="mt-4 text-xs leading-5 text-[var(--muted)]">El precio mostrado es de lista. La promoción vigente y la disponibilidad por sucursal se confirmarán durante la compra.</p></div></div>}
      </dialog>
    </>
  );
}
