"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconBoxSeam,
  IconPackage,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { sileo } from "sileo";

import type { CatalogPage, CatalogProductSummary, CatalogVariant } from "@/lib/catalog/types";
import type { InventoryDashboard, InventoryDashboardItem } from "@/lib/inventory/dashboard-types";

type MovementType = "RECEIPT" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";
type MovementResponse = { stock: InventoryDashboardItem; movement: { id: string; type: MovementType; quantity: number; reason: string | null; createdAt: string } };

async function readBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function requestInventory(branchId?: string): Promise<InventoryDashboard> {
  const params = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const response = await fetch(`/api/operations/inventory${params}`, { cache: "no-store" });
  const body = await readBody(response) as { message?: unknown } | null;
  if (!response.ok) throw new Error(typeof body?.message === "string" ? body.message : "No se pudo consultar el inventario.");
  return body as InventoryDashboard;
}

async function createMovement(input: {
  productId: string;
  variantId: string;
  branchId: string;
  type: MovementType;
  quantity: number;
  reorderPoint?: number;
  reason?: string;
}): Promise<MovementResponse> {
  const response = await fetch("/api/operations/inventory/movements", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await readBody(response) as (MovementResponse & { message?: unknown }) | null;
  if (!response.ok || !body?.stock || !body.movement) {
    throw new Error(typeof body?.message === "string" ? body.message : "No se pudo registrar el movimiento.");
  }
  return body;
}

export function InventoryReplenishmentDesk({
  initialCatalog,
  initialInventory,
}: {
  initialCatalog: CatalogPage | null;
  initialInventory: InventoryDashboard | null;
}) {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState(initialInventory?.branch.id ?? "");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<{ product: CatalogProductSummary; variant: CatalogVariant } | null>(null);
  const [type, setType] = useState<MovementType>("RECEIPT");
  const [quantity, setQuantity] = useState("1");
  const [reorderPoint, setReorderPoint] = useState("");
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState<string | null>(null);

  const inventory = useQuery({
    queryKey: ["inventory-replenishment", branchId],
    queryFn: () => requestInventory(branchId || undefined),
    initialData: branchId === initialInventory?.branch.id ? initialInventory : undefined,
    staleTime: 10_000,
    retry: false,
  });
  const dashboard = inventory.data ?? initialInventory;
  const currentStock = useMemo(() => new Map((dashboard?.items ?? []).map((item) => [item.variantId, item])), [dashboard?.items]);
  const options = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("es-MX");
    const products = initialCatalog?.items ?? [];
    return products.flatMap((product) => product.variants.map((variant) => ({ product, variant }))).filter(({ product, variant }) => {
      if (!needle) return true;
      return [product.name, product.brand.name, product.category.name, variant.sku, variant.label, variant.size, variant.color, variant.material]
        .filter(Boolean).join(" ").toLocaleLowerCase("es-MX").includes(needle);
    });
  }, [initialCatalog?.items, search]);

  const movement = useMutation({
    mutationFn: () => createMovement({
      productId: selection!.product.id,
      variantId: selection!.variant.id,
      branchId,
      type,
      quantity: Number(quantity),
      reorderPoint: reorderPoint.trim() ? Number(reorderPoint) : undefined,
      reason: reason.trim() || undefined,
    }),
    onSuccess: async (result) => {
      setValidation(null);
      setQuantity("1");
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["inventory-replenishment"] });
      await queryClient.invalidateQueries({ queryKey: ["physical-sales-inventory"] });
      sileo.success({ title: "Movimiento registrado", description: `${movementLabel(result.movement.type)} · ${result.movement.quantity} unidad${result.movement.quantity === 1 ? "" : "es"}.` });
    },
    onError: (error) => sileo.error({ title: "No se pudo actualizar existencias", description: error instanceof Error ? error.message : "Inténtalo nuevamente." }),
  });

  function submit() {
    if (!branchId) return setValidation("Selecciona una sucursal.");
    if (!selection) return setValidation("Selecciona una variante del catálogo.");
    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 1_000_000) {
      return setValidation("Captura una cantidad entera mayor que cero.");
    }
    if (reorderPoint.trim() && (!Number.isInteger(Number(reorderPoint)) || Number(reorderPoint) < 0)) {
      return setValidation("El punto de pedido debe ser un entero igual o mayor que cero.");
    }
    setValidation(null);
    movement.mutate();
  }

  const selectedStock = selection ? currentStock.get(selection.variant.id) : null;
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10" aria-busy={inventory.isFetching || movement.isPending}>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]"><IconBoxSeam size={18} aria-hidden="true" />Inventory Service</div>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Reabastecimiento y ajustes</h1>
          <p className="mt-3 text-pretty text-sm leading-6 text-[var(--muted)]">Registra entradas y correcciones con una variante oficial de Catalog. Cada movimiento queda auditado y actualiza el stock por sucursal.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-52"><span className="text-sm font-medium">Sucursal</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)} disabled={inventory.isFetching || !dashboard} className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm disabled:cursor-not-allowed disabled:opacity-55"><option value="">Selecciona una sucursal</option>{dashboard?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <button type="button" onClick={() => void inventory.refetch()} disabled={inventory.isFetching} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold transition-colors duration-200 hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"><IconRefresh className={inventory.isFetching ? "animate-spin motion-reduce:animate-none" : undefined} size={17} aria-hidden="true" />Actualizar</button>
        </div>
      </div>

      {inventory.error || !dashboard ? <Unavailable message={inventory.error instanceof Error ? inventory.error.message : "Inventory no está disponible temporalmente."} retry={() => void inventory.refetch()} /> : <div className="mt-8 grid gap-7 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div>
          <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]" aria-labelledby="variants-title">
            <div className="flex flex-col justify-between gap-4 border-b border-[var(--line)] px-5 py-5 sm:flex-row sm:items-end sm:px-6"><div><h2 id="variants-title" className="font-semibold tracking-[-0.02em]">Variantes para {dashboard.branch.name}</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">La selección conserva talla, color, material y SKU independientes.</p></div><label className="relative block w-full sm:max-w-72"><span className="sr-only">Buscar variante</span><IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={17} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar SKU o atributo" className="h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] pl-9 pr-3 text-sm" /></label></div>
            {!initialCatalog ? <div className="px-5 py-10 text-center text-sm leading-6 text-[var(--muted)]">Catalog no está disponible para verificar variantes. Intenta actualizar esta vista más tarde.</div> : options.length === 0 ? <div className="px-5 py-10 text-center text-sm leading-6 text-[var(--muted)]">No hay variantes que coincidan con la búsqueda.</div> : <div className="divide-y divide-[var(--line)]">{options.map(({ product, variant }) => <VariantRow key={variant.id} product={product} variant={variant} stock={currentStock.get(variant.id) ?? null} selected={selection?.variant.id === variant.id} onSelect={() => { setSelection({ product, variant }); setValidation(null); }} />)}</div>}
          </section>
        </div>

        <aside className="h-fit rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6 xl:sticky xl:top-6" aria-labelledby="movement-title">
          <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><IconPackage size={20} aria-hidden="true" /></span><div><h2 id="movement-title" className="font-semibold tracking-[-0.02em]">Nuevo movimiento</h2><p className="mt-1 text-sm leading-5 text-[var(--muted)]">No se modifica el stock desde el navegador.</p></div></div>
          <SelectedVariant selection={selection} stock={selectedStock ?? null} />
          <div className="mt-6 grid gap-4"><label className="grid gap-1.5 text-sm font-medium">Tipo<select value={type} onChange={(event) => setType(event.target.value as MovementType)} className="min-h-11 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm"><option value="RECEIPT">Recepción de mercancía</option><option value="ADJUSTMENT_IN">Ajuste de entrada</option><option value="ADJUSTMENT_OUT">Ajuste de salida</option></select></label><label className="grid gap-1.5 text-sm font-medium">Cantidad<input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="numeric" type="number" min="1" step="1" className="min-h-11 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm" /></label><label className="grid gap-1.5 text-sm font-medium">Punto de pedido <span className="font-normal text-[var(--muted)]">(opcional)</span><input value={reorderPoint} onChange={(event) => setReorderPoint(event.target.value)} inputMode="numeric" type="number" min="0" step="1" placeholder={selectedStock?.reorderPoint === null || !selectedStock ? "Sin definir" : `Actual: ${selectedStock.reorderPoint}`} className="min-h-11 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm" /></label><label className="grid gap-1.5 text-sm font-medium">Motivo <span className="font-normal text-[var(--muted)]">(opcional)</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} placeholder="Ej. recepción de proveedor" className="resize-y rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm" /></label></div>
          {validation ? <p role="alert" className="mt-4 rounded-xl bg-[var(--danger-surface)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{validation}</p> : null}
          <button type="button" disabled={movement.isPending || !selection} onClick={submit} className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50">{type === "ADJUSTMENT_OUT" ? <IconArrowDown size={18} aria-hidden="true" /> : <IconArrowUp size={18} aria-hidden="true" />}{movement.isPending ? "Registrando movimiento" : movementLabel(type)}</button>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Las ventas físicas se confirman en Caja; esta operación no puede simular una venta.</p>
        </aside>
      </div>}
    </section>
  );
}

function VariantRow({ product, variant, stock, selected, onSelect }: { product: CatalogProductSummary; variant: CatalogVariant; stock: InventoryDashboardItem | null; selected: boolean; onSelect: () => void }) {
  const state = stock?.available === 0 ? "Agotado" : stock && stock.reorderPoint !== null && stock.available <= stock.reorderPoint ? "Reabastecer" : stock ? "En stock" : "Sin existencias";
  const tone = state === "Agotado" || state === "Reabastecer" ? "bg-[var(--danger-surface)] text-[var(--danger)]" : stock ? "bg-[var(--success-surface)] text-[var(--success)]" : "bg-[var(--surface-muted)] text-[var(--muted)]";
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={`flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors duration-200 hover:bg-[var(--surface-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6 ${selected ? "bg-[var(--accent-soft)]/45" : ""}`}><div className="min-w-0"><p className="font-medium">{product.name}</p><p className="mt-1 text-sm text-[var(--muted)]">{variant.label} · <span className="font-mono text-xs">{variant.sku}</span></p><p className="mt-1 text-xs text-[var(--muted)]">{[variant.size && `Talla: ${variant.size}`, variant.color && `Color: ${variant.color}`, variant.material && `Material: ${variant.material}`].filter(Boolean).join(" · ") || "Sin atributos adicionales"}</p></div><div className="flex shrink-0 items-center gap-3"><div className="text-right text-sm"><p className="font-semibold">{stock ? stock.available : "—"} disponibles</p><p className="mt-0.5 text-xs text-[var(--muted)]">{stock?.reorderPoint === null || !stock ? "Punto no definido" : `Punto: ${stock.reorderPoint}`}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{state}</span></div></button>;
}

function SelectedVariant({ selection, stock }: { selection: { product: CatalogProductSummary; variant: CatalogVariant } | null; stock: InventoryDashboardItem | null }) {
  if (!selection) return <div className="mt-6 rounded-xl bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[var(--muted)]">Selecciona una variante de la lista para registrar un movimiento.</div>;
  return <div className="mt-6 border-y border-[var(--line)] py-4"><p className="font-medium">{selection.product.name}</p><p className="mt-1 text-sm text-[var(--muted)]">{selection.variant.label} · <span className="font-mono text-xs">{selection.variant.sku}</span></p><p className="mt-3 text-sm"><span className="text-[var(--muted)]">Disponible actual: </span><span className="font-semibold">{stock?.available ?? 0}</span></p></div>;
}

function Unavailable({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="mt-8 rounded-2xl border border-[var(--warning)]/35 bg-[var(--warning-surface)] p-5"><div className="flex items-center gap-2 font-semibold"><IconAlertTriangle size={19} aria-hidden="true" />Inventario temporalmente no disponible</div><p className="mt-2 text-sm leading-6">{message} Conservamos las demás áreas de la plataforma.</p><button type="button" onClick={retry} className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-[var(--surface)] px-3 text-sm font-semibold transition-colors hover:bg-[var(--accent-soft)]">Reintentar</button></div>;
}

function movementLabel(type: MovementType) {
  if (type === "RECEIPT") return "Registrar recepción";
  if (type === "ADJUSTMENT_IN") return "Registrar ajuste de entrada";
  return "Registrar ajuste de salida";
}
