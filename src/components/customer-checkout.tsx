"use client";

import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCircleCheck,
  IconLoader2,
  IconMinus,
  IconPlus,
  IconShoppingBag,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useCustomerCart } from "@/components/customer-cart-provider";
import type { CustomerCartLine } from "@/lib/cart/customer-cart";
import { getCatalogProduct } from "@/lib/catalog/catalog-client";
import type { CatalogProductSummary, CatalogVariant } from "@/lib/catalog/types";

type CheckoutBranch = { id: string; name: string };
type CheckoutResult = { order: { id: string; status: string; total: number; currency: string } };
type CheckoutConfirmation = CheckoutResult & { branchName: string; itemCount: number };
type CheckoutMutationResult = { result: CheckoutResult; sentLines: CustomerCartLine[]; branchName: string; itemCount: number };
type ResolvedCartLine = { product: CatalogProductSummary; variant: CatalogVariant; quantity: number };

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
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

function productImageStyle(product: CatalogProductSummary) {
  return product.imageUrl ? { backgroundImage: `url("${product.imageUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined;
}

function reference(orderId: string) {
  return `PEDIDO-${orderId.slice(0, 8).toUpperCase()}`;
}

export function CustomerCheckout() {
  const { lines, itemCount, ready, revise, remove, consume } = useCustomerCart();
  const [branchId, setBranchId] = useState("");
  const [confirmation, setConfirmation] = useState<CheckoutConfirmation | null>(null);
  const checkoutKey = useRef<string | null>(null);
  const productIds = useMemo(() => [...new Set(lines.map((line) => line.productId))], [lines]);
  const productQueries = useQueries({
    queries: productIds.map((productId) => ({
      queryKey: ["catalog-product", productId],
      queryFn: ({ signal }) => getCatalogProduct(productId, signal),
      enabled: ready,
      staleTime: 60_000,
      retry: false,
    })),
  });
  const products = useMemo(() => {
    const values = new Map<string, CatalogProductSummary>();
    productQueries.forEach((query, index) => {
      if (query.data) values.set(productIds[index], query.data);
    });
    return values;
  }, [productIds, productQueries]);
  const resolvedLines = useMemo<ResolvedCartLine[]>(() => lines.flatMap((line) => {
    const product = products.get(line.productId);
    const variant = product?.variants.find((candidate) => candidate.id === line.variantId);
    return product && variant ? [{ product, variant, quantity: line.quantity }] : [];
  }), [lines, products]);
  const unverifiedLines = useMemo(() => lines.filter((line) => !resolvedLines.some((item) => item.product.id === line.productId && item.variant.id === line.variantId)), [lines, resolvedLines]);
  const productsLoading = !ready || productQueries.some((query) => query.isLoading);
  const productsFailed = productQueries.some((query) => query.isError);
  const branchesQuery = useQuery({
    queryKey: ["checkout", "branches"],
    queryFn: () => jsonRequest<{ branches: CheckoutBranch[] }>("/api/checkout/branches"),
    enabled: ready && resolvedLines.length > 0 && unverifiedLines.length === 0 && !confirmation,
    staleTime: 60_000,
    retry: false,
  });
  const branches = branchesQuery.data?.branches ?? [];
  const selectedBranch = branches.find((branch) => branch.id === branchId);
  const cartSignature = lines.map((line) => `${line.productId}:${line.variantId}:${line.quantity}`).join("|");
  const currencies = useMemo(() => new Set(resolvedLines.map((item) => item.variant.currency)), [resolvedLines]);
  const hasMixedCurrencies = currencies.size > 1;
  const total = resolvedLines.reduce((sum, item) => sum + item.variant.listPrice * item.quantity, 0);
  const currency = resolvedLines[0]?.variant.currency ?? "MXN";

  useEffect(() => { checkoutKey.current = null; }, [branchId, cartSignature]);

  const checkout = useMutation({
    mutationFn: async () => {
      if (!branchId || !resolvedLines.length || unverifiedLines.length > 0 || hasMixedCurrencies) throw new Error("Revisa los artículos y selecciona una sucursal antes de confirmar.");
      const idempotencyKey = checkoutKey.current ?? (checkoutKey.current = crypto.randomUUID());
      const sentLines = resolvedLines.map((item) => ({ productId: item.product.id, variantId: item.variant.id, quantity: item.quantity }));
      const result = await jsonRequest<CheckoutResult>("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ branchId, items: sentLines }),
      });
      return { result, sentLines, branchName: selectedBranch?.name ?? "Sucursal seleccionada", itemCount: sentLines.reduce((sum, line) => sum + line.quantity, 0) } satisfies CheckoutMutationResult;
    },
    onSuccess: ({ result, sentLines, branchName, itemCount: submittedItemCount }) => {
      setConfirmation({ ...result, branchName, itemCount: submittedItemCount });
      consume(sentLines);
      checkoutKey.current = null;
    },
  });

  if (confirmation) return <Confirmation confirmation={confirmation} />;

  return <section className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
    <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]"><IconArrowLeft size={18} aria-hidden="true" />Seguir explorando</Link>
    <div className="mt-4 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[var(--accent-strong)]">Tu bolsa</p><h1 className="mt-2 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Revisa tu compra antes de confirmar.</h1><p className="mt-3 max-w-2xl text-pretty leading-7 text-[var(--muted)]">Elige dónde recogerás tu pedido. Precio y existencia se confirman de manera segura antes de registrarlo.</p></div><p className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--accent-strong)]">{itemCount} {itemCount === 1 ? "artículo" : "artículos"}</p></div>
    {!ready || productsLoading ? <CheckoutSkeleton /> : lines.length === 0 ? <EmptyBag /> : <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]" aria-labelledby="bag-lines-title">
        <div className="border-b border-[var(--line)] px-5 py-4 sm:px-6"><h2 id="bag-lines-title" className="font-semibold">Artículos seleccionados</h2><p className="mt-1 text-sm text-[var(--muted)]">Puedes ajustar cantidades o quitar una variante.</p></div>
        <div className="divide-y divide-[var(--line)]">{resolvedLines.map((item) => <CartLine key={item.variant.id} item={item} disabled={checkout.isPending} onAdjust={(delta) => revise({ productId: item.product.id, variantId: item.variant.id }, delta)} onRemove={() => remove(item.variant.id)} />)}</div>
        {unverifiedLines.length > 0 ? <div className="border-t border-[var(--line)] bg-[var(--warning-surface)] px-5 py-4 sm:px-6" role="alert"><div className="flex items-start gap-3"><IconAlertTriangle className="mt-0.5 shrink-0 text-[var(--warning)]" size={19} aria-hidden="true" /><div><p className="text-sm font-semibold">Hay artículos que requieren atención</p><p className="mt-1 text-sm leading-6 text-[var(--muted)]">{productsFailed ? "No pudimos verificar uno o más artículos. Reintenta la verificación o quítalos antes de confirmar." : "Una variante ya no está disponible. Quítala antes de confirmar."}</p><div className="mt-3 flex flex-wrap gap-2">{productsFailed ? <button type="button" onClick={() => { productQueries.forEach((query) => { void query.refetch(); }); }} disabled={checkout.isPending} className="inline-flex min-h-11 items-center rounded-lg bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--warning)] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-45">Reintentar verificación</button> : null}{unverifiedLines.map((line) => <button key={line.variantId} type="button" onClick={() => remove(line.variantId)} disabled={checkout.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--warning)] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-45">Quitar artículo no disponible<IconTrash size={16} aria-hidden="true" /></button>)}</div></div></div></div> : null}
      </section>
      <aside className="h-fit rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 lg:sticky lg:top-28 sm:p-6" aria-labelledby="checkout-summary-title">
        <h2 id="checkout-summary-title" className="font-semibold">Confirmar pedido</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Elige una sucursal para retiro.</p>
        <label className="mt-5 block text-sm font-semibold"><span>Sucursal de retiro</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)} disabled={branchesQuery.isLoading || Boolean(branchesQuery.error) || checkout.isPending} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm disabled:cursor-not-allowed disabled:opacity-55"><option value="">{branchesQuery.isLoading ? "Cargando sucursales…" : "Selecciona una sucursal"}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        {branchesQuery.isError ? <div role="alert" className="mt-3 flex flex-wrap items-start gap-2 text-sm leading-5 text-[var(--danger)]"><IconAlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden="true" /><span>{branchesQuery.error instanceof Error ? branchesQuery.error.message : "No fue posible cargar las sucursales."}</span><button type="button" onClick={() => { void branchesQuery.refetch(); }} disabled={checkout.isPending} className="min-h-10 rounded-lg px-2 font-semibold underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-45">Reintentar</button></div> : null}
        <dl className="mt-6 space-y-2 border-y border-[var(--line)] py-4 text-sm"><div className="flex items-center justify-between gap-4 text-[var(--muted)]"><dt>Artículos</dt><dd>{itemCount}</dd></div><div className="flex items-end justify-between gap-4"><dt className="font-semibold">Total estimado</dt><dd className="text-xl font-semibold tracking-[-0.03em]">{money(total, currency)}</dd></div></dl>
        <p className="mt-4 text-xs leading-5 text-[var(--muted)]">El total se calcula con el precio publicado. Pricing e Inventory validan el precio vigente y la existencia al confirmar.</p>
        {hasMixedCurrencies ? <p role="alert" className="mt-4 flex gap-2 text-sm leading-5 text-[var(--danger)]"><IconAlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />Tu bolsa contiene precios en distintas monedas. Ajusta los artículos antes de confirmar.</p> : null}
        {checkout.isError ? <p role="alert" className="mt-4 flex gap-2 text-sm leading-5 text-[var(--danger)]"><IconAlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />{checkout.error instanceof Error ? checkout.error.message : "No fue posible confirmar tu pedido."}</p> : null}
        <button type="button" onClick={() => checkout.mutate()} disabled={!branchId || !resolvedLines.length || unverifiedLines.length > 0 || hasMixedCurrencies || branchesQuery.isLoading || Boolean(branchesQuery.error) || checkout.isPending} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-45">{checkout.isPending ? <><IconLoader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Confirmando pedido</> : <><IconCircleCheck size={18} aria-hidden="true" />Confirmar pedido</>}</button>
      </aside>
    </div>}
  </section>;
}

function CartLine({ item, onAdjust, onRemove, disabled }: { item: ResolvedCartLine; onAdjust: (delta: number) => void; onRemove: () => void; disabled: boolean }) {
  return <article className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6"><div className="flex min-w-0 items-center gap-3"><div role="img" aria-label={`Imagen de ${item.product.name}`} className="grid size-14 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-muted)] bg-cover bg-center" style={productImageStyle(item.product)}>{!item.product.imageUrl ? <span aria-hidden="true" className="place-self-center font-semibold text-[var(--accent-strong)]">{item.product.name.slice(0, 1)}</span> : null}</div><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.product.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{item.variant.label} · SKU {item.variant.sku}</p><p className="mt-1 text-sm font-semibold">{money(item.variant.listPrice * item.quantity, item.variant.currency)}</p></div></div><div className="flex items-center gap-2"><div className="flex min-h-11 items-center rounded-lg border border-[var(--line)]"><button type="button" aria-label={`Restar ${item.product.name}`} onClick={() => onAdjust(-1)} disabled={disabled} className="grid size-11 place-items-center text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-45"><IconMinus size={16} aria-hidden="true" /></button><span className="w-8 text-center text-sm font-semibold" aria-label={`${item.quantity} unidades`}>{item.quantity}</span><button type="button" aria-label={`Sumar ${item.product.name}`} onClick={() => onAdjust(1)} disabled={disabled} className="grid size-11 place-items-center text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-45"><IconPlus size={16} aria-hidden="true" /></button></div><button type="button" onClick={onRemove} disabled={disabled} aria-label={`Quitar ${item.product.name}`} className="grid size-11 place-items-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--danger-surface)] hover:text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-45"><IconTrash size={17} aria-hidden="true" /></button></div></article>;
}

function EmptyBag() {
  return <section className="mt-8 grid min-h-72 place-items-center rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-12 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><IconShoppingBag size={24} aria-hidden="true" /></span><h2 className="mt-5 text-xl font-semibold tracking-[-0.025em]">Tu bolsa está vacía</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">Agrega una variante desde el catálogo para revisar tu compra y elegir una sucursal de retiro.</p><Link href="/" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]"><IconArrowLeft size={17} aria-hidden="true" />Explorar catálogo</Link></div></section>;
}

function CheckoutSkeleton() {
  return <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-label="Cargando tu bolsa" aria-busy="true"><div className="h-72 rounded-2xl bg-[var(--surface-muted)] animate-pulse motion-reduce:animate-none" /><div className="h-80 rounded-2xl bg-[var(--surface-muted)] animate-pulse motion-reduce:animate-none" /></div>;
}

function Confirmation({ confirmation }: { confirmation: CheckoutConfirmation }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);

  return <section aria-labelledby="confirmation-heading" className="mx-auto grid min-h-[calc(100dvh-12rem)] max-w-[760px] place-items-center px-4 py-10 sm:px-6"><p className="sr-only" role="status" aria-live="polite" aria-atomic="true">Pedido confirmado. Referencia {reference(confirmation.order.id)}.</p><div className="w-full rounded-2xl border border-[var(--success)]/35 bg-[var(--surface)] p-6 sm:p-8"><span className="grid size-12 place-items-center rounded-xl bg-[var(--success-surface)] text-[var(--success)]"><IconCircleCheck size={25} aria-hidden="true" /></span><p className="mt-7 text-sm font-semibold text-[var(--success)]">Pedido confirmado</p><h1 ref={headingRef} id="confirmation-heading" tabIndex={-1} className="mt-2 text-balance text-3xl font-semibold tracking-[-0.04em]">Tu compra quedó registrada.</h1><p className="mt-3 max-w-xl text-pretty leading-7 text-[var(--muted)]">Confirmamos {confirmation.itemCount} {confirmation.itemCount === 1 ? "artículo" : "artículos"} para retiro en <span className="font-semibold text-[var(--ink)]">{confirmation.branchName}</span>.</p><dl className="mt-7 divide-y divide-[var(--line)] border-y border-[var(--line)]"><div className="flex items-center justify-between gap-4 py-3.5"><dt className="text-sm text-[var(--muted)]">Referencia</dt><dd className="font-mono text-xs font-semibold text-[var(--accent-strong)]">{reference(confirmation.order.id)}</dd></div><div className="flex items-center justify-between gap-4 py-3.5"><dt className="text-sm text-[var(--muted)]">Total confirmado</dt><dd className="text-sm font-semibold">{money(confirmation.order.total, confirmation.order.currency)}</dd></div><div className="flex items-center justify-between gap-4 py-3.5"><dt className="text-sm text-[var(--muted)]">Estado</dt><dd className="text-sm font-semibold">Confirmado</dd></div></dl><p className="mt-5 text-sm leading-6 text-[var(--muted)]">Guarda esta referencia. Tu sucursal preparará el pedido conforme avance la operación.</p><div className="mt-7 flex flex-wrap gap-3"><Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]"><IconShoppingBag size={17} aria-hidden="true" />Seguir comprando</Link><Link href="/account" className="inline-flex min-h-11 items-center rounded-xl border border-[var(--line)] px-4 text-sm font-semibold transition-colors hover:bg-[var(--surface-muted)]">Ir a mi cuenta</Link></div></div></section>;
}
