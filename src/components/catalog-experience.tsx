"use client";

import {
  IconAlertTriangle,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconShoppingBag,
  IconTag,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { searchCatalog } from "@/lib/catalog/catalog-client";
import type { Role } from "@/lib/auth/roles";
import type { CatalogPage, CatalogProductSummary, CatalogVariant } from "@/lib/catalog/types";

type CatalogExperienceProps = {
  initialPage: CatalogPage;
  initialError?: boolean;
  userRole: Role | null;
};

type CartItem = { product: CatalogProductSummary; variant: CatalogVariant; quantity: number };
type CheckoutBranch = { id: string; name: string };
type CheckoutResult = { order: { id: string; status: string; total: number; currency: string } };

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
    return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function messageFrom(response: Response, body: unknown) {
  if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") return body.message;
  return response.status === 401 ? "Tu sesión ya no está disponible. Inicia sesión nuevamente." : "No fue posible completar la operación.";
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "X-Correlation-Id": crypto.randomUUID(), ...init?.headers } });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(messageFrom(response, body));
  return body as T;
}

function visibleAttributes(product: CatalogProductSummary) {
  return product.variants.flatMap((variant) => [variant.size, variant.color, variant.material].filter(Boolean) as string[]);
}

function ProductMedia({ product, compact = false }: { product: CatalogProductSummary; compact?: boolean }) {
  const source = product.imageUrl;
  const style = source?.includes("departmental-products-v1.png")
    ? { backgroundImage: `url("${source}")`, backgroundPosition: spritePositionBySlug[product.slug] ?? "50% 50%", backgroundSize: "300% 200%" }
    : source ? { backgroundImage: `url("${source}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined;
  return <div role="img" aria-label={`Imagen de ${product.name}`} className={`${compact ? "aspect-square" : "aspect-[3/4]"} grid overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] bg-no-repeat ${style ? "" : "place-items-center"}`} style={style}>
    {!style && <span aria-hidden="true" className="text-3xl font-semibold tracking-[-0.04em] text-[var(--accent-strong)]">{product.name.slice(0, 1)}</span>}
  </div>;
}

function PriceHint({ product }: { product: CatalogProductSummary }) {
  const prices = product.variants.map((variant) => variant.listPrice).filter(Number.isFinite);
  const currency = product.variants[0]?.currency ?? "MXN";
  if (!prices.length) return <p className="text-sm font-medium text-[var(--muted)]">Sin variantes activas</p>;
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  return <div><p className="text-xs font-medium text-[var(--muted)]">Precio base</p><p className="mt-0.5 text-lg font-semibold tracking-[-0.025em]">{minimum === maximum ? money(minimum, currency) : `Desde ${money(minimum, currency)}`}</p></div>;
}

function quantityTotal(cart: CartItem[]) { return cart.reduce((total, item) => total + item.quantity, 0); }
function listTotal(cart: CartItem[]) { return cart.reduce((total, item) => total + item.variant.listPrice * item.quantity, 0); }

export function CatalogExperience({ initialPage, initialError = false, userRole }: CatalogExperienceProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [requestedPage, setRequestedPage] = useState(initialPage.page);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProductSummary | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [addedVariantId, setAddedVariantId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<CheckoutResult | null>(null);
  const detailDialogRef = useRef<HTMLDialogElement>(null);
  const checkoutKey = useRef<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const canBuy = userRole === "CUSTOMER";

  const categories = useMemo(() => Array.from(new Map(initialPage.items.map((product) => [product.category.slug, product.category.name])).entries()), [initialPage.items]);
  const brands = useMemo(() => Array.from(new Map(initialPage.items.map((product) => [product.brand.slug, product.brand.name])).entries()), [initialPage.items]);
  const catalogSearch = useMemo(() => ({ search: deferredSearch, category, brand, page: requestedPage, pageSize: 20 }), [brand, category, deferredSearch, requestedPage]);
  const catalogQuery = useQuery({ queryKey: ["catalog", catalogSearch], queryFn: ({ signal }) => searchCatalog(catalogSearch, signal), initialData: initialError ? undefined : initialPage, placeholderData: keepPreviousData, retry: false });
  const branchesQuery = useQuery({
    queryKey: ["checkout", "branches"],
    queryFn: () => jsonRequest<{ branches: CheckoutBranch[] }>("/api/checkout/branches"),
    enabled: canBuy && checkoutOpen && !confirmation,
    staleTime: 60_000,
    retry: false,
  });
  const checkout = useMutation({
    mutationFn: () => jsonRequest<CheckoutResult>("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": checkoutKey.current ?? (checkoutKey.current = crypto.randomUUID()) },
      body: JSON.stringify({ branchId, items: cart.map((item) => ({ productId: item.product.id, variantId: item.variant.id, quantity: item.quantity })) }),
    }),
    onSuccess: (result) => { setConfirmation(result); setCart([]); checkoutKey.current = null; },
  });
  const page = catalogQuery.data ?? initialPage;
  const catalogError = catalogQuery.isError || (initialError && !catalogQuery.data) ? "No pudimos actualizar el catálogo. Conservamos los últimos resultados mientras reintentas." : null;
  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize));

  useEffect(() => {
    const dialog = detailDialogRef.current;
    if (!dialog) return;
    if (selectedProduct && !dialog.open) dialog.showModal();
    if (!selectedProduct && dialog.open) dialog.close();
  }, [selectedProduct]);

  function resetPage() { setRequestedPage(1); }
  function reviseCart(product: CatalogProductSummary, variant: CatalogVariant, delta: number) {
    checkoutKey.current = null;
    setConfirmation(null);
    setCart((current) => {
      const match = current.find((item) => item.variant.id === variant.id);
      if (!match && delta <= 0) return current;
      if (!match) return [...current, { product, variant, quantity: 1 }];
      const quantity = Math.min(20, match.quantity + delta);
      return quantity <= 0 ? current.filter((item) => item.variant.id !== variant.id) : current.map((item) => item.variant.id === variant.id ? { ...item, quantity } : item);
    });
  }
  function addVariant(product: CatalogProductSummary, variant: CatalogVariant) { reviseCart(product, variant, 1); setAddedVariantId(variant.id); }
  function removeVariant(variantId: string) { checkoutKey.current = null; setConfirmation(null); setCart((current) => current.filter((item) => item.variant.id !== variantId)); }
  function openCheckout() { setCheckoutOpen(true); setConfirmation(null); }
  function changeBranch(value: string) { checkoutKey.current = null; setBranchId(value); }

  return <>
    <section className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="grid items-end gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="max-w-2xl"><p className="text-sm font-semibold text-[var(--accent-strong)]">Catálogo departamental</p><h1 className="mt-2 text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Encuentra la variante exacta para ti.</h1><p className="mt-3 max-w-xl text-pretty text-base leading-7 text-[var(--muted)]">Elige una variante, agrégala a tu compra y selecciona tu sucursal de retiro. El precio y la existencia se confirman de forma segura al finalizar.</p></div>
        <div className="flex flex-wrap items-center justify-end gap-3"><div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]"><span className="font-semibold text-[var(--ink)]">{page.total}</span> productos publicados</div>{canBuy && <button type="button" onClick={openCheckout} disabled={!cart.length} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-45"><IconShoppingBag size={18} aria-hidden="true" />Mi compra{cart.length ? ` · ${quantityTotal(cart)}` : ""}</button>}</div>
      </div>
      {canBuy && checkoutOpen && <CheckoutPanel cart={cart} branchId={branchId} branches={branchesQuery.data?.branches ?? []} branchesLoading={branchesQuery.isLoading} branchesError={branchesQuery.isError ? branchesQuery.error.message : null} confirmation={confirmation} error={checkout.isError ? checkout.error.message : null} pending={checkout.isPending} onBranchChange={changeBranch} onClose={() => setCheckoutOpen(false)} onCheckout={() => checkout.mutate()} onAdjust={reviseCart} onRemove={removeVariant} />}
      <section className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3" aria-label="Filtros del catálogo" aria-busy={catalogQuery.isFetching}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]"><label className="relative block"><span className="sr-only">Buscar productos</span><IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={19} stroke={1.75} aria-hidden="true" /><input value={search} onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder="Buscar productos, marcas o categorías" className="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] pl-10 pr-3 text-sm transition-colors focus:border-[var(--accent)] focus:outline-none" /></label><label><span className="sr-only">Categoría</span><select value={category} onChange={(event) => { setCategory(event.target.value); resetPage(); }} className="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm transition-colors focus:border-[var(--accent)] focus:outline-none"><option value="">Todas las categorías</option>{categories.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select></label><label><span className="sr-only">Marca</span><select value={brand} onChange={(event) => { setBrand(event.target.value); resetPage(); }} className="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm transition-colors focus:border-[var(--accent)] focus:outline-none"><option value="">Todas las marcas</option>{brands.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select></label></div>
      </section>
      {catalogError && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-surface)] px-4 py-3 text-sm text-[var(--ink)]" role="alert"><span className="flex items-center gap-2"><IconAlertTriangle size={18} className="text-[var(--danger)]" aria-hidden="true" />{catalogError}</span><button type="button" onClick={() => { void catalogQuery.refetch(); }} className="inline-flex min-h-10 items-center gap-2 font-semibold text-[var(--danger)] underline decoration-1 underline-offset-4"><IconRefresh size={16} aria-hidden="true" />Reintentar</button></div>}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3" aria-live="polite"><p className="text-sm text-[var(--muted)]">{catalogQuery.isFetching ? "Actualizando catálogo…" : `${page.items.length} resultados en esta página`}</p>{(search || category || brand) && <button type="button" onClick={() => { setSearch(""); setCategory(""); setBrand(""); setRequestedPage(1); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]"><IconX size={16} aria-hidden="true" />Limpiar filtros</button>}</div>
      {page.items.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] px-6 py-16 text-center"><IconSearch className="mx-auto text-[var(--muted)]" size={30} stroke={1.5} aria-hidden="true" /><h2 className="mt-3 font-semibold">No encontramos coincidencias</h2><p className="mt-1 text-sm text-[var(--muted)]">Prueba con otra búsqueda, categoría o marca.</p></div> : <div className="mt-7 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{page.items.map((product) => <ProductCard key={product.id} product={product} onOpen={() => { setSelectedProduct(product); setAddedVariantId(null); }} />)}</div>}
      {page.total > page.pageSize && <nav className="mt-10 flex items-center justify-center gap-3" aria-label="Paginación del catálogo"><button type="button" disabled={page.page <= 1 || catalogQuery.isFetching} onClick={() => setRequestedPage(page.page - 1)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[var(--line)] px-3 text-sm font-semibold transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-45"><IconChevronLeft size={17} aria-hidden="true" />Anterior</button><p className="text-sm text-[var(--muted)]">Página <span className="font-semibold text-[var(--ink)]">{page.page}</span> de {totalPages}</p><button type="button" disabled={page.page >= totalPages || catalogQuery.isFetching} onClick={() => setRequestedPage(page.page + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[var(--line)] px-3 text-sm font-semibold transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-45">Siguiente<IconChevronRight size={17} aria-hidden="true" /></button></nav>}
    </section>
    <dialog ref={detailDialogRef} onClose={() => setSelectedProduct(null)} aria-labelledby="product-dialog-title" className="w-[min(46rem,calc(100vw-2rem))] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-0 text-[var(--ink)] shadow-xl backdrop:bg-black/35">
      {selectedProduct && <ProductDialog product={selectedProduct} userRole={userRole} addedVariantId={addedVariantId} onAdd={addVariant} onClose={() => detailDialogRef.current?.close()} />}
    </dialog>
  </>;
}

function ProductCard({ product, onOpen }: { product: CatalogProductSummary; onOpen: () => void }) {
  const attributes = Array.from(new Set(visibleAttributes(product))).slice(0, 3);
  return <article className="group min-w-0"><ProductMedia product={product} /><div className="mt-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-[var(--muted)]">{product.brand.name}</p><h2 className="mt-1 text-base font-semibold tracking-[-0.02em]">{product.name}</h2></div><span className="shrink-0 rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--accent-strong)]">{product.category.name}</span></div><p className="mt-2 min-h-10 text-sm leading-5 text-[var(--muted)]">{product.description ?? "Conoce las opciones disponibles de este producto."}</p><div className="mt-4 flex items-end justify-between gap-3 border-t border-[var(--line)] pt-3"><PriceHint product={product} /><p className="text-right text-xs font-semibold text-[var(--muted)]">{product.variants.length} {product.variants.length === 1 ? "variante" : "variantes"}</p></div>{attributes.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{attributes.map((attribute) => <span key={attribute} className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-xs text-[var(--muted)]">{attribute}</span>)}</div>}<button type="button" onClick={onOpen} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-3 text-sm font-semibold text-[var(--surface)] transition-colors duration-200 hover:bg-[var(--accent-strong)]"><IconTag size={17} stroke={2} aria-hidden="true" />Ver variantes</button></div></article>;
}

function ProductDialog({ product, userRole, addedVariantId, onAdd, onClose }: { product: CatalogProductSummary; userRole: Role | null; addedVariantId: string | null; onAdd: (product: CatalogProductSummary, variant: CatalogVariant) => void; onClose: () => void }) {
  const canBuy = userRole === "CUSTOMER";
  return <div className="grid gap-6 p-5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:p-6"><ProductMedia product={product} compact /><div><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[var(--accent-strong)]">{product.brand.name} · {product.category.name}</p><h2 id="product-dialog-title" className="mt-1 text-balance text-2xl font-semibold tracking-[-0.03em]">{product.name}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar detalle" className="grid size-10 shrink-0 place-items-center rounded-xl text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"><IconX size={20} aria-hidden="true" /></button></div><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{product.description ?? "Revisa las variantes disponibles de este producto."}</p><div className="mt-5 border-y border-[var(--line)] py-4"><p className="text-sm font-semibold">Elige una variante</p><div className="mt-3 space-y-2">{product.variants.map((variant) => <div key={variant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-muted)] px-3 py-3"><div><p className="text-sm font-semibold">{variant.label}</p><p className="mt-0.5 text-xs text-[var(--muted)]">SKU {variant.sku}</p></div><div className="flex items-center gap-3"><p className="text-sm font-semibold">{money(variant.listPrice, variant.currency)}</p>{canBuy && <button type="button" onClick={() => onAdd(product, variant)} className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors ${addedVariantId === variant.id ? "bg-[var(--success-surface)] text-[var(--success)]" : "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]"}`}><IconPlus size={16} aria-hidden="true" />{addedVariantId === variant.id ? "Agregada" : "Agregar"}</button>}</div></div>)}</div></div>{userRole === null ? <Link href="/login?next=/" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]"><IconShoppingBag size={17} aria-hidden="true" />Inicia sesión para comprar</Link> : !canBuy ? <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Las compras en línea se realizan con una cuenta CUSTOMER. El personal usa el flujo de ventas físicas.</p> : <p className="mt-4 text-xs leading-5 text-[var(--muted)]">El precio final y la existencia se confirman al enviar el pedido.</p>}</div></div>;
}

function CheckoutPanel({ cart, branchId, branches, branchesLoading, branchesError, confirmation, error, pending, onBranchChange, onClose, onCheckout, onAdjust, onRemove }: { cart: CartItem[]; branchId: string; branches: CheckoutBranch[]; branchesLoading: boolean; branchesError: string | null; confirmation: CheckoutResult | null; error: string | null; pending: boolean; onBranchChange: (value: string) => void; onClose: () => void; onCheckout: () => void; onAdjust: (product: CatalogProductSummary, variant: CatalogVariant, delta: number) => void; onRemove: (variantId: string) => void }) {
  if (confirmation) return <section className="mt-7 rounded-2xl border border-[var(--success)]/35 bg-[var(--success-surface)] p-5 sm:p-6" aria-live="polite"><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><IconCircleCheck className="mt-0.5 shrink-0 text-[var(--success)]" size={22} aria-hidden="true" /><div><h2 className="font-semibold">Pedido confirmado</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Tu pedido fue registrado con el identificador <span className="font-mono text-xs text-[var(--ink)]">{confirmation.order.id}</span>. El total confirmado es {money(confirmation.order.total, confirmation.order.currency)}.</p></div></div><button type="button" onClick={onClose} className="inline-flex min-h-10 rounded-lg px-3 text-sm font-semibold text-[var(--success)] transition-colors hover:bg-[var(--surface)]">Continuar</button></div></section>;
  const total = listTotal(cart);
  const currency = cart[0]?.variant.currency ?? "MXN";
  return <section className="mt-7 rounded-2xl border border-[var(--line)] bg-[var(--surface)]" aria-labelledby="checkout-title"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-6"><div className="flex items-center gap-2"><IconShoppingBag className="text-[var(--accent-strong)]" size={20} aria-hidden="true" /><div><h2 id="checkout-title" className="font-semibold">Tu compra</h2><p className="mt-0.5 text-sm text-[var(--muted)]">Elige una sucursal y confirma tu pedido.</p></div></div><button type="button" onClick={onClose} className="inline-flex min-h-10 rounded-lg px-3 text-sm font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)]">Cerrar</button></div><div className="grid xl:grid-cols-[minmax(0,1fr)_22rem]"><div className="divide-y divide-[var(--line)]">{cart.length === 0 ? <div className="px-5 py-10 text-center sm:px-6"><IconShoppingBag className="mx-auto text-[var(--muted)]" size={25} aria-hidden="true" /><p className="mt-3 text-sm font-semibold">Tu compra está vacía</p><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Agrega una variante desde el catálogo para continuar.</p></div> : cart.map((item) => <div key={item.variant.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6"><div className="min-w-0"><p className="text-sm font-semibold">{item.product.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{item.variant.label} · SKU {item.variant.sku}</p><p className="mt-1 text-sm font-semibold">{money(item.variant.listPrice * item.quantity, item.variant.currency)}</p></div><div className="flex items-center gap-2"><div className="flex min-h-10 items-center rounded-lg border border-[var(--line)]"><button type="button" aria-label={`Restar ${item.product.name}`} onClick={() => onAdjust(item.product, item.variant, -1)} className="grid size-10 place-items-center text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"><IconMinus size={16} aria-hidden="true" /></button><span className="w-7 text-center text-sm font-semibold">{item.quantity}</span><button type="button" aria-label={`Sumar ${item.product.name}`} onClick={() => onAdjust(item.product, item.variant, 1)} className="grid size-10 place-items-center text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"><IconPlus size={16} aria-hidden="true" /></button></div><button type="button" onClick={() => onRemove(item.variant.id)} aria-label={`Quitar ${item.product.name}`} className="grid size-10 place-items-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--danger-surface)] hover:text-[var(--danger)]"><IconTrash size={17} aria-hidden="true" /></button></div></div>)}</div><aside className="border-t border-[var(--line)] p-5 xl:border-l xl:border-t-0 sm:p-6"><label className="block text-sm font-semibold"><span>Sucursal de retiro</span><select value={branchId} onChange={(event) => onBranchChange(event.target.value)} disabled={branchesLoading || Boolean(branchesError)} className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm disabled:cursor-not-allowed disabled:opacity-55"><option value="">{branchesLoading ? "Cargando sucursales…" : "Selecciona una sucursal"}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>{branchesError && <p role="alert" className="mt-3 text-sm leading-5 text-[var(--danger)]">{branchesError}</p>}<dl className="mt-6 space-y-2 border-t border-[var(--line)] pt-4 text-sm"><div className="flex items-center justify-between gap-4 text-[var(--muted)]"><dt>Artículos</dt><dd>{quantityTotal(cart)}</dd></div><div className="flex items-end justify-between gap-4"><dt className="font-semibold">Estimado de lista</dt><dd className="text-xl font-semibold tracking-[-0.03em]">{money(total, currency)}</dd></div></dl><p className="mt-3 text-xs leading-5 text-[var(--muted)]">Pricing e Inventory confirman el precio vigente y la existencia antes de aceptar el pedido.</p>{error && <p role="alert" className="mt-4 flex gap-2 text-sm leading-5 text-[var(--danger)]"><IconAlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />{error}</p>}<button type="button" onClick={onCheckout} disabled={!cart.length || !branchId || pending || branchesLoading || Boolean(branchesError)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-45"><IconCircleCheck size={18} aria-hidden="true" />{pending ? "Confirmando pedido" : "Confirmar pedido"}</button></aside></div></section>;
}
