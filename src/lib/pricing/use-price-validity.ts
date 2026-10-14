"use client";
import { useEffect, useState } from "react";
import type { CatalogProductSummary } from "@/lib/catalog/types";

export function withoutCatalogPrices(product: CatalogProductSummary): CatalogProductSummary {
  return { ...product, variants: product.variants.map(variant => ({ ...variant, price: undefined })) };
}

export function usePriceValidity(validUntil: string | undefined, failed: boolean): boolean {
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    if (!validUntil) return;
    const remaining = Date.parse(validUntil) - Date.now();
    if (!Number.isFinite(remaining)) return;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.max(1, remaining));
    return () => window.clearTimeout(timer);
  }, [validUntil]);
  useEffect(() => {
    const update = () => setClock(Date.now());
    window.addEventListener("focus", update); window.addEventListener("online", update);
    return () => { window.removeEventListener("focus", update); window.removeEventListener("online", update); };
  }, []);
  return !failed && Boolean(validUntil && Date.parse(validUntil) > clock);
}
