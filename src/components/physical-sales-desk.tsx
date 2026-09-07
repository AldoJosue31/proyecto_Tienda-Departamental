"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconMinus,
  IconPackage,
  IconPlus,
  IconRefresh,
  IconShoppingBag,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useRef, useState } from "react";
import { sileo } from "sileo";

import type { CatalogPage, CatalogProductSummary, CatalogVariant } from "@/lib/catalog/types";
import type { InventoryDashboard, InventoryDashboardItem } from "@/lib/inventory/dashboard-types";

type CartItem = {
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  variantLabel: string;
  listPrice: number;
  currency: string;
  quantity: number;
};

type CreatedOrder = {
  id: string;
  channel: "ONLINE" | "PHYSICAL";
  status: string;
  currency: string;
  total: number;
  items: Array<{ variantId: string; quantity: number }>;
};

type SaleResponse = { order: CreatedOrder };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function makeIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `pos-${crypto.randomUUID()}`
    : `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function requestInventory(branchId?: string): Promise<InventoryDashboard> {
  const params = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const response = await fetch(`/api/operations/inventory${params}`, { cache: "no-store" });
  const body = await readBody(response) as { message?: unknown } | null;
  if (!response.ok) throw new Error(typeof body?.message === "string" ? body.message : "No se pudo consultar el inventario de la sucursal.");
  return body as InventoryDashboard;
}

async function createPhysicalSale(input: { branchId: string; customerId: string; items: CartItem[] }, idempotencyKey: string): Promise<SaleResponse> {
  const response = await fetch("/api/operations/sales", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      branchId: input.branchId,
      customerId: input.customerId,
      items: input.items.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
    }),
  });
  const body = await readBody(response) as (SaleResponse & { message?: unknown }) | null;
  if (!response.ok || !body?.order) {
    throw new Error(typeof body?.message === "string" ? body.message : "No se pudo confirmar el ticket.");
  }
  return body;
}

export function PhysicalSalesDesk({
  initialCatalog,
  initialCatalogFailed,
  initialInventory,
  initialInventoryFailed,
}: {
  initialCatalog: CatalogPage;
  initialCatalogFailed: boolean;
  initialInventory: InventoryDashboard | null;
  initialInventoryFailed: boolean;
}) {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState(initialInventory?.branch.id ?? "");
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [validation, setValidation] = useState<string | null>(null);
  const [completed, setCompleted] = useState<CreatedOrder | null>(null);
  const checkoutKey = useRef<string | null>(null);
  const selectedBranchId = branchId || initialInventory?.branch.id || "";

  const inventory = useQuery({
    queryKey: ["physical-sales-inventory", selectedBranchId],
    queryFn: () => requestInventory(selectedBranchId || undefined),
    initialData: selectedBranchId === initialInventory?.branch.id ? initialInventory : undefined,
    retry: false,
    staleTime: 10_000,
  });
  const dashboard = inventory.data ?? initialInventory;

  const stockByVariant = useMemo(
    () => new Map((dashboard?.items ?? []).map((item) => [item.variantId, item])),
    [dashboard?.items],
  );
  const products = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("es-MX");
    if (!needle) return initialCatalog.items;
    return initialCatalog.items.filter((product) => {
      const content = [product.name, product.brand.name, product.category.name, ...product.variants.flatMap((variant) => [variant.sku, variant.label, variant.size, variant.color, variant.material])]
        .filter(Boolean).join(" ").toLocaleLowerCase("es-MX");
      return content.includes(needle);
    });
  }, [initialCatalog.items, search]);
  const listTotal = useMemo(() => cart.reduce((sum, item) => sum + item.listPrice * item.quantity, 0), [cart]);
  const currency = cart[0]?.currency ?? "MXN";

  const sale = useMutation({
    mutationFn: () => createPhysicalSale({ branchId: selectedBranchId, customerId: customerId.trim(), items: cart }, checkoutKey.current ?? (checkoutKey.current = makeIdempotencyKey())),
    onSuccess: async ({ order }) => {
      setCompleted(order);
      setCart([]);
      setCustomerId("");
      setValidation(null);
      checkoutKey.current = null;
      await queryClient.invalidateQueries({ queryKey: ["physical-sales-inventory"] });
      sileo.success({ title: "Venta confirmada", description: `Ticket ${shortId(order.id)} · ${money(order.total, order.currency)}.` });
    },
    onError: (error) => {
      sileo.error({
        title: "El ticket no fue confirmado",
        description: error instanceof Error ? error.message : "Verifica la información e inténtalo nuevamente.",
      });
    },
  });

  function add(product: CatalogProductSummary, variant: CatalogVariant) {
    const stock = stockByVariant.get(variant.id);
    if (!stock || stock.available < 1) return;
    setCompleted(null);
    setValidation(null);
    setCart((current) => {
      const found = current.find((item) => item.variantId === variant.id);
      if (found) {
        if (found.quantity >= stock.available) return current;
        return current.map((item) => item.variantId === variant.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...current, {
        productId: product.id,
        variantId: variant.id,
        productName: product.name,
        sku: variant.sku,
        variantLabel: variant.label,
        listPrice: variant.listPrice,
        currency: variant.currency,
        quantity: 1,
      }];
    });
  }

  function adjust(variantId: string, direction: -1 | 1) {
    setCart((current) => current.flatMap((item) => {
      if (item.variantId !== variantId) return [item];
      const available = stockByVariant.get(variantId)?.available ?? 0;
      const quantity = direction === 1 ? Math.min(item.quantity + 1, available) : item.quantity - 1;
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
    setCompleted(null);
    checkoutKey.current = null;
  }

  function clearTicket() {
    setCart([]);
    setValidation(null);
    setCompleted(null);
    checkoutKey.current = null;
  }

  function selectBranch(nextBranchId: string) {
    if (cart.length) return;
    setBranchId(nextBranchId);
    setCompleted(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBranchId) return setValidation("Selecciona una sucursal con inventario disponible.");
    if (!uuid.test(customerId.trim())) return setValidation("Captura un ID de cliente registrado válido para atribuir la venta.");
    if (!cart.length) return setValidation("Agrega al menos una variante al ticket.");
    setValidation(null);
    sale.mutate();
  }

  const inventoryUnavailable = inventory.isError || (initialInventoryFailed && !inventory.data);
  const catalogUnavailable = initialCatalogFailed && initialCatalog.items.length === 0;

  return (
    <section aria-labelledby="physical-sales-title" aria-busy={sale.isPending}>
      <div className="flex flex-col justify-between gap-5 border-b border-[var(--line)] pb-7 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]"><IconShoppingBag size={18} aria-hidden="true" />Operación de sucursal</div>
          <h1 id="physical-sales-title" className="mt-2 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Venta física</h1>
          <p className="mt-3 text-pretty text-sm leading-6 text-[var(--muted)]">Registra un ticket por sucursal. La confirmación consulta el precio vigente y consume existencias desde Orders e Inventory.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]" aria-live="polite">
          <span>{dashboard ? `Inventario actualizado ${formatTime(dashboard.generatedAt)}` : "Conectando a Inventory"}</span>
          <button type="button" onClick={() => void inventory.refetch()} disabled={inventory.isFetching} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-55"><IconRefresh className={inventory.isFetching ? "animate-spin motion-reduce:animate-none" : undefined} size={17} aria-hidden="true" />Actualizar</button>
        </div>
      </div>

      {inventoryUnavailable ? <Unavailable title="Inventario no disponible" message={inventory.error instanceof Error ? inventory.error.message : "No fue posible consultar las existencias de la sucursal."} retry={() => void inventory.refetch()} /> : null}
      {catalogUnavailable ? <Unavailable title="Catálogo no disponible" message="No fue posible cargar variantes para la venta." retry={() => window.location.reload()} /> : null}

      <div className="mt-7 grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <section className="min-w-0" aria-labelledby="products-title">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_17rem]">
            <label className="grid gap-1.5 text-sm font-medium"><span>Buscar producto o SKU</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, marca, variante o SKU" className="min-h-11 rounded-xl border bg-[var(--surface)] px-3 text-sm transition-colors focus:border-[var(--accent)] focus:outline-none" /></label>
            <label className="grid gap-1.5 text-sm font-medium"><span>Sucursal de venta</span><select value={selectedBranchId} onChange={(event) => selectBranch(event.target.value)} disabled={cart.length > 0 || inventory.isFetching} className="min-h-11 rounded-xl border bg-[var(--surface)] px-3 text-sm transition-colors focus:border-[var(--accent)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-55"><option value="">Selecciona una sucursal</option>{dashboard?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>{cart.length > 0 ? <span className="text-xs font-normal leading-5 text-[var(--muted)]">Vacía el ticket para cambiar de sucursal.</span> : null}</label>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4"><h2 id="products-title" className="text-lg font-semibold tracking-[-0.025em]">Variantes disponibles</h2><p className="text-sm text-[var(--muted)]">{products.length} {products.length === 1 ? "producto" : "productos"}</p></div>
          {!dashboard ? <ProductSkeleton /> : products.length === 0 ? <EmptyProducts /> : <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]"><div className="hidden grid-cols-[minmax(13rem,1.4fr)_minmax(11rem,1fr)_6rem_5.5rem] gap-4 bg-[var(--surface-muted)] px-5 py-3 text-xs font-semibold text-[var(--muted)] md:grid"><span>Producto y SKU</span><span>Variante</span><span className="text-right">Disponible</span><span className="text-right">Acción</span></div><div className="divide-y divide-[var(--line)]">{products.flatMap((product) => product.variants.filter((variant) => variant.status === "ACTIVE").map((variant) => <VariantRow key={variant.id} product={product} variant={variant} stock={stockByVariant.get(variant.id)} onAdd={add} />))}</div></div>}
        </section>

        <aside className="xl:sticky xl:top-6" aria-labelledby="ticket-title">
          <form onSubmit={submit} className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4"><div><h2 id="ticket-title" className="font-semibold tracking-[-0.02em]">Ticket actual</h2><p className="mt-1 text-xs text-[var(--muted)]">{dashboard?.branch.name ?? "Sin sucursal seleccionada"}</p></div><span className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] px-2 text-xs font-semibold text-[var(--accent-strong)]">{cart.reduce((sum, item) => sum + item.quantity, 0)}</span></div>
            <div className="px-5 py-4"><label className="grid gap-1.5 text-sm font-medium"><span>ID del cliente registrado</span><input value={customerId} onChange={(event) => { setCustomerId(event.target.value); setValidation(null); }} inputMode="text" autoComplete="off" placeholder="UUID del cliente" aria-describedby="customer-id-hint" className="min-h-11 rounded-xl border bg-[var(--surface)] px-3 font-mono text-sm transition-colors focus:border-[var(--accent)] focus:outline-none" /></label><p id="customer-id-hint" className="mt-2 text-xs leading-5 text-[var(--muted)]">Escanea o captura el identificador del cliente. El sistema lo asocia a la compra sin exponer datos personales.</p></div>
            <div className="border-y border-[var(--line)]">{cart.length === 0 ? <div className="px-5 py-10 text-center"><IconPackage className="mx-auto text-[var(--muted)]" size={25} aria-hidden="true" /><p className="mt-3 text-sm font-semibold">Aún no hay artículos</p><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Selecciona una variante con existencias para comenzar el ticket.</p></div> : <ul className="divide-y divide-[var(--line)]">{cart.map((item) => <CartLine key={item.variantId} item={item} available={stockByVariant.get(item.variantId)?.available ?? 0} onAdjust={adjust} />)}</ul>}</div>
            <div className="px-5 py-4"><dl className="space-y-2 text-sm"><div className="flex items-center justify-between gap-4 text-[var(--muted)]"><dt>Importe de lista</dt><dd>{money(listTotal, currency)}</dd></div><div className="flex items-end justify-between gap-4 border-t border-[var(--line)] pt-3"><dt className="font-semibold">Total a confirmar</dt><dd className="text-xl font-semibold tracking-[-0.03em]">{money(listTotal, currency)}</dd></div></dl><p className="mt-3 text-xs leading-5 text-[var(--muted)]">Pricing confirma promociones y el total final antes de completar la venta.</p>{validation ? <p role="alert" className="mt-3 flex gap-2 text-sm leading-5 text-[var(--danger)]"><IconAlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />{validation}</p> : null}{cart.length > 0 ? <button type="button" onClick={clearTicket} disabled={sale.isPending} className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-55"><IconTrash size={16} aria-hidden="true" />Vaciar ticket</button> : null}<button type="submit" disabled={!cart.length || sale.isPending || inventoryUnavailable} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55"><IconCircleCheck size={18} aria-hidden="true" />{sale.isPending ? "Confirmando venta" : "Confirmar venta"}</button></div>
          </form>
          {completed ? <section className="mt-4 rounded-2xl bg-[var(--success-surface)] p-5" aria-live="polite"><div className="flex gap-3"><IconCircleCheck className="mt-0.5 shrink-0 text-[var(--success)]" size={21} aria-hidden="true" /><div><h2 className="font-semibold text-[var(--success)]">Venta confirmada</h2><p className="mt-1 text-sm leading-6 text-[var(--ink)]">Ticket {shortId(completed.id)} · {money(completed.total, completed.currency)}. Inventory publicará el cambio de existencias al Dashboard.</p></div></div></section> : null}
        </aside>
      </div>
    </section>
  );
}

function VariantRow({ product, variant, stock, onAdd }: { product: CatalogProductSummary; variant: CatalogVariant; stock: InventoryDashboardItem | undefined; onAdd: (product: CatalogProductSummary, variant: CatalogVariant) => void }) {
  const unavailable = !stock || stock.available === 0;
  return <article className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(13rem,1.4fr)_minmax(11rem,1fr)_6rem_5.5rem] md:items-center md:gap-4"><div className="min-w-0"><p className="truncate text-sm font-semibold">{product.name}</p><p className="mt-1 truncate font-mono text-xs text-[var(--muted)]">{variant.sku}</p></div><div className="min-w-0"><p className="text-sm font-medium">{variant.label}</p><p className="mt-1 text-xs text-[var(--muted)]">{money(variant.listPrice, variant.currency)}</p></div><div className="flex items-center justify-between gap-3 md:block md:text-right"><span className="text-xs text-[var(--muted)] md:hidden">Disponible</span><span className={unavailable ? "text-sm font-semibold text-[var(--danger)]" : "text-sm font-semibold"}>{unavailable ? "AGOTADO" : stock.available}</span></div><button type="button" onClick={() => onAdd(product, variant)} disabled={unavailable} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] px-3 text-sm font-semibold transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-45"><IconPlus size={16} aria-hidden="true" />Agregar</button></article>;
}

function CartLine({ item, available, onAdjust }: { item: CartItem; available: number; onAdjust: (variantId: string, direction: -1 | 1) => void }) {
  return <li className="px-5 py-4"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.productName}</p><p className="mt-1 truncate text-xs text-[var(--muted)]">{item.variantLabel} · <span className="font-mono">{item.sku}</span></p></div><p className="shrink-0 text-sm font-semibold">{money(item.listPrice * item.quantity, item.currency)}</p></div><div className="mt-3 flex items-center justify-between gap-3"><div className="inline-flex items-center rounded-lg border border-[var(--line)]"><button type="button" onClick={() => onAdjust(item.variantId, -1)} aria-label={`Disminuir ${item.productName}`} className="grid size-9 place-items-center transition-colors hover:bg-[var(--surface-muted)]"><IconMinus size={15} aria-hidden="true" /></button><span className="grid min-w-9 place-items-center text-sm font-semibold" aria-label={`${item.quantity} unidades`}>{item.quantity}</span><button type="button" onClick={() => onAdjust(item.variantId, 1)} disabled={item.quantity >= available} aria-label={`Aumentar ${item.productName}`} className="grid size-9 place-items-center transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-40"><IconPlus size={15} aria-hidden="true" /></button></div><span className={available < item.quantity ? "text-xs font-semibold text-[var(--danger)]" : "text-xs text-[var(--muted)]"}>{available} disponible{available === 1 ? "" : "s"}</span></div></li>;
}

function ProductSkeleton() { return <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"><div className="h-8 animate-pulse rounded-lg bg-[var(--surface-muted)] motion-reduce:animate-none" /><div className="mt-4 h-16 animate-pulse rounded-lg bg-[var(--surface-muted)] motion-reduce:animate-none" /><div className="mt-3 h-16 animate-pulse rounded-lg bg-[var(--surface-muted)] motion-reduce:animate-none" /></div>; }
function EmptyProducts() { return <div className="mt-3 rounded-2xl border border-dashed border-[var(--line)] px-5 py-12 text-center"><IconPackage className="mx-auto text-[var(--muted)]" size={28} aria-hidden="true" /><h3 className="mt-3 font-semibold">No hay variantes para esta búsqueda</h3><p className="mt-1 text-sm text-[var(--muted)]">Prueba con otro nombre, SKU o sucursal.</p></div>; }
function Unavailable({ title, message, retry }: { title: string; message: string; retry: () => void }) { return <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--warning)]/35 bg-[var(--warning-surface)] p-5"><div className="flex gap-3"><IconAlertTriangle className="mt-0.5 shrink-0 text-[var(--warning)]" size={20} aria-hidden="true" /><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-6">{message}</p></div></div><button type="button" onClick={retry} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--surface)] px-3 text-sm font-semibold transition-colors hover:bg-[var(--accent-soft)]"><IconRefresh size={16} aria-hidden="true" />Reintentar</button></div>; }
function shortId(id: string) { return id.slice(0, 8).toUpperCase(); }
function formatTime(value: string) { return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
