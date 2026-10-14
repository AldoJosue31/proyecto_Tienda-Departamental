"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { priceRefreshDelay, type CartQuote, type QuoteItem } from "./types";

export function useCartQuote(items: QuoteItem[], couponCode = "", identityKey = "operations") {
  const normalizedCoupon = couponCode.trim().toUpperCase();
  const signature = JSON.stringify(items);
  const query = useQuery({
    queryKey: ["cart-quote", identityKey, signature, normalizedCoupon],
    queryFn: async ({ signal }): Promise<CartQuote> => {
      const response = await fetch("/api/pricing/cart", { method: "POST", signal, cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, ...(normalizedCoupon ? { couponCode: normalizedCoupon } : {}) }) });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body) throw new Error(body?.message ?? "No fue posible actualizar los precios.");
      return body as CartQuote;
    },
    enabled: items.length > 0, retry: false, staleTime: 0, refetchOnWindowFocus: "always", refetchOnReconnect: "always",
    refetchInterval: query => query.state.status === "error" ? 5000 : priceRefreshDelay(query.state.data?.validUntil),
  });
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    if (!query.data) return;
    const remaining = Date.parse(query.data.validUntil) - Date.now();
    const timer = window.setTimeout(() => setClock(Date.now()), Math.max(1, Number.isFinite(remaining) ? remaining : 1));
    return () => window.clearTimeout(timer);
  }, [query.data]);
  useEffect(() => {
    const update = () => setClock(Date.now());
    window.addEventListener("focus", update); window.addEventListener("online", update);
    return () => { window.removeEventListener("focus", update); window.removeEventListener("online", update); };
  }, []);
  const valid = Boolean(items.length && query.data && !query.isError && Date.parse(query.data.validUntil) > clock);
  return { ...query, valid };
}
