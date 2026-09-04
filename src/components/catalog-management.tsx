"use client";

import { IconBoxSeam, IconCircleCheck, IconPlus, IconTags } from "@tabler/icons-react";
import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";

import { createCatalogProduct, createCatalogVariant } from "@/app/catalog/manage/actions";
import { initialCatalogActionState } from "@/app/catalog/manage/catalog-state";
import type { CatalogProductSummary } from "@/lib/catalog/types";

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-xs font-medium text-[var(--danger)]">{message}</p> : null;
}

function Outcome({ message, status }: { message?: string; status?: "success" | "error" }) {
  if (!message) return null;
  return <p role={status === "error" ? "alert" : "status"} className={`mt-4 rounded-xl px-3 py-2.5 text-sm ${status === "error" ? "bg-[var(--danger-surface)] text-[var(--danger)]" : "bg-[var(--success-surface)] text-[var(--success)]"}`}>{message}</p>;
}

export function CatalogManagement({ products }: { products: CatalogProductSummary[] }) {
  const router = useRouter();
  const [productState, productAction] = useActionState(createCatalogProduct, initialCatalogActionState);
  const [variantState, variantAction] = useActionState(createCatalogVariant, initialCatalogActionState);

  useEffect(() => {
    if (productState.status === "success" || variantState.status === "success") router.refresh();
  }, [productState.status, router, variantState.status]);

  return (
    <section className="mx-auto max-w-[1200px] px-4 py-9 sm:px-6 lg:px-8 lg:py-12">
      <p className="text-sm font-semibold text-[var(--accent-strong)]">Administración de catálogo</p>
      <h1 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Productos y variantes, con trazabilidad real.</h1>
      <p className="mt-3 max-w-2xl text-pretty leading-7 text-[var(--muted)]">Cada variante conserva un SKU único y sus atributos de talla, color y material. Las existencias se conectarán por <code>variantId</code> en Inventory Service.</p>

      <div className="mt-9 grid gap-6 xl:grid-cols-2">
        <form action={productAction} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
          <div className="flex items-start gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><IconBoxSeam size={21} aria-hidden="true" /></span><div><h2 className="font-semibold">Crear producto base</h2><p className="mt-1 text-sm leading-5 text-[var(--muted)]">Categoría y marca se normalizan en Catalog Service.</p></div></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="text-sm font-semibold">Nombre</span><input name="name" required className="mt-1.5 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm focus:border-[var(--accent)] focus:outline-none" /><FieldError message={productState.fieldErrors?.name?.[0]} /></label>
            <label><span className="text-sm font-semibold">Categoría</span><input name="category" required placeholder="Electrónica" className="mt-1.5 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm focus:border-[var(--accent)] focus:outline-none" /><FieldError message={productState.fieldErrors?.category?.[0]} /></label>
            <label><span className="text-sm font-semibold">Marca</span><input name="brand" required placeholder="Aurora" className="mt-1.5 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm focus:border-[var(--accent)] focus:outline-none" /><FieldError message={productState.fieldErrors?.brand?.[0]} /></label>
            <label className="sm:col-span-2"><span className="text-sm font-semibold">Descripción</span><textarea name="description" rows={3} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none" /></label>
            <label><span className="text-sm font-semibold">Etiquetas</span><input name="tags" placeholder="hogar, diseño" className="mt-1.5 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm focus:border-[var(--accent)] focus:outline-none" /></label>
            <label><span className="text-sm font-semibold">URL de imagen</span><input name="imageUrl" type="url" placeholder="https://…" className="mt-1.5 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm focus:border-[var(--accent)] focus:outline-none" /></label>
          </div>
          <Outcome {...productState} />
          <button type="submit" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--ink)] px-4 text-sm font-semibold text-[var(--surface)] transition-colors hover:bg-[var(--accent-strong)]"><IconPlus size={17} aria-hidden="true" />Crear producto</button>
        </form>

        <form action={variantAction} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
          <div className="flex items-start gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><IconTags size={21} aria-hidden="true" /></span><div><h2 className="font-semibold">Registrar variante</h2><p className="mt-1 text-sm leading-5 text-[var(--muted)]">El SKU no puede repetirse; una variante se desactiva, no se borra.</p></div></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="text-sm font-semibold">Producto base</span><select name="productId" required disabled={products.length === 0} className="mt-1.5 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm focus:border-[var(--accent)] focus:outline-none"><option value="">{products.length ? "Selecciona un producto" : "Aún no hay productos"}</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><FieldError message={variantState.fieldErrors?.productId?.[0]} /></label>
            <label className="sm:col-span-2"><span className="text-sm font-semibold">SKU</span><input name="sku" required placeholder="AURORA-55-NEGRO" className="mt-1.5 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm uppercase focus:border-[var(--accent)] focus:outline-none" /><FieldError message={variantState.fieldErrors?.sku?.[0]} /></label>
            <label><span className="text-sm font-semibold">Talla</span><input name="size" placeholder="M" className="mt-1.5 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm focus:border-[var(--accent)] focus:outline-none" /></label>
            <label><span className="text-sm font-semibold">Color</span><input name="color" placeholder="Negro" className="mt-1.5 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm focus:border-[var(--accent)] focus:outline-none" /></label>
            <label><span className="text-sm font-semibold">Material</span><input name="material" placeholder="Aluminio" className="mt-1.5 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm focus:border-[var(--accent)] focus:outline-none" /></label>
            <label><span className="text-sm font-semibold">Precio de lista</span><input name="listPrice" required type="number" min="0.01" step="0.01" className="mt-1.5 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm focus:border-[var(--accent)] focus:outline-none" /><FieldError message={variantState.fieldErrors?.listPrice?.[0]} /></label>
            <label><span className="text-sm font-semibold">Moneda</span><input name="currency" defaultValue="MXN" maxLength={3} className="mt-1.5 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 text-sm uppercase focus:border-[var(--accent)] focus:outline-none" /></label>
          </div>
          <Outcome {...variantState} />
          <button type="submit" disabled={products.length === 0} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-45"><IconPlus size={17} aria-hidden="true" />Agregar variante</button>
        </form>
      </div>

      <section className="mt-7 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><div className="flex items-center gap-2"><IconCircleCheck className="text-[var(--success)]" size={20} aria-hidden="true" /><h2 className="font-semibold">Productos publicados</h2></div>{products.length ? <div className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">{products.map((product) => <div key={product.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5"><div><p className="text-sm font-semibold">{product.name}</p><p className="mt-0.5 text-xs text-[var(--muted)]">{product.brand.name} · {product.category.name} · {product.variants.length} variantes</p></div><span className="font-mono text-xs text-[var(--muted)]">{product.id}</span></div>)}</div> : <p className="mt-4 text-sm text-[var(--muted)]">Crea el primer producto para registrar sus variantes.</p>}</section>
    </section>
  );
}
