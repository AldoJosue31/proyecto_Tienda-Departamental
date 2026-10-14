import type { CatalogVariant } from "@/lib/catalog/types";

function money(value: number, currency: string) { return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
export function VariantPrice({ variant, quantity = 1 }: { variant: Pick<CatalogVariant, "price" | "listPrice" | "currency">; quantity?: number }) {
  if (!variant.price) return <span className="grid gap-1"><span className="font-semibold">{money(variant.listPrice * quantity, variant.currency)}</span><span className="text-xs text-[var(--muted)]">Precio de lista · Cotización pendiente</span></span>;
  const price = variant.price;
  return <span className="grid gap-1"><span className="font-semibold">{money(price.effectivePrice * quantity, price.currency)}</span>{price.discountAmount > 0 ? <><span className="text-xs text-[var(--muted)]"><s>{money(price.basePrice * quantity, price.currency)}</s> · Ahorras {money(price.discountAmount * quantity, price.currency)}</span><span className="text-xs font-semibold text-[var(--accent-strong)]">{price.appliedPromotion?.name ?? "Descuento vigente"}</span></> : null}</span>;
}
