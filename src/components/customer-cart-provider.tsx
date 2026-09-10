"use client";

import { IconShoppingBag } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  consumeCustomerCart,
  customerCartItemCount,
  customerCartStorageKey,
  normalizeCustomerCart,
  removeCustomerCartLine,
  reviseCustomerCart,
  type CustomerCartLine,
} from "@/lib/cart/customer-cart";

type CustomerCartContextValue = {
  customerId: string | null;
  lines: CustomerCartLine[];
  itemCount: number;
  ready: boolean;
  add: (input: Pick<CustomerCartLine, "productId" | "variantId">) => boolean;
  revise: (input: Pick<CustomerCartLine, "productId" | "variantId">, delta: number) => void;
  remove: (variantId: string) => void;
  consume: (lines: CustomerCartLine[]) => void;
  clear: () => void;
};

const CustomerCartContext = createContext<CustomerCartContextValue | null>(null);

export function CustomerCartProvider({ customerId, children }: { customerId: string | null; children: ReactNode }) {
  const [lines, setLines] = useState<CustomerCartLine[]>([]);
  const [readyForCustomer, setReadyForCustomer] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (!customerId) {
        setLines([]);
        setReadyForCustomer(null);
        return;
      }
      try {
        const stored = window.localStorage.getItem(customerCartStorageKey(customerId));
        setLines(normalizeCustomerCart(stored ? JSON.parse(stored) : []));
      } catch {
        setLines([]);
      }
      setReadyForCustomer(customerId);
    });
    return () => { active = false; };
  }, [customerId]);

  useEffect(() => {
    if (!customerId || readyForCustomer !== customerId) return;
    try {
      window.localStorage.setItem(customerCartStorageKey(customerId), JSON.stringify(lines));
    } catch {
      // Storage can be unavailable in privacy-restricted browsers. The in-memory
      // cart remains usable and server-side validation still protects checkout.
    }
  }, [customerId, lines, readyForCustomer]);

  const add = useCallback((input: Pick<CustomerCartLine, "productId" | "variantId">) => {
    if (!customerId || readyForCustomer !== customerId) return false;
    const next = reviseCustomerCart(lines, input, 1);
    if (next === lines) return false;
    setLines(next);
    return true;
  }, [customerId, lines, readyForCustomer]);
  const revise = useCallback((input: Pick<CustomerCartLine, "productId" | "variantId">, delta: number) => {
    if (!customerId) return;
    setLines((current) => reviseCustomerCart(current, input, delta));
  }, [customerId]);
  const remove = useCallback((variantId: string) => setLines((current) => removeCustomerCartLine(current, variantId)), []);
  const consume = useCallback((sentLines: CustomerCartLine[]) => {
    setLines((current) => consumeCustomerCart(current, sentLines));
  }, []);
  const clear = useCallback(() => setLines([]), []);
  const value = useMemo<CustomerCartContextValue>(() => ({
    customerId,
    lines,
    itemCount: customerCartItemCount(lines),
    ready: customerId === null || readyForCustomer === customerId,
    add,
    revise,
    remove,
    consume,
    clear,
  }), [add, clear, consume, customerId, lines, readyForCustomer, remove, revise]);

  return <CustomerCartContext.Provider value={value}>{children}</CustomerCartContext.Provider>;
}

export function useCustomerCart() {
  const value = useContext(CustomerCartContext);
  if (!value) throw new Error("CustomerCartProvider is required to use the customer cart.");
  return value;
}

export function CustomerBagLink() {
  const pathname = usePathname();
  const { customerId, itemCount, ready } = useCustomerCart();
  if (!customerId) return null;

  const label = ready && itemCount > 0 ? `Bolsa, ${itemCount} artículos` : "Bolsa";
  return <Link href="/checkout" aria-current={pathname === "/checkout" ? "page" : undefined} aria-label={label} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${pathname === "/checkout" ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"}`}>
    <IconShoppingBag size={18} aria-hidden="true" />
    <span className="hidden sm:inline">Bolsa</span>
    {ready && itemCount > 0 ? <span className="grid min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-xs font-bold text-white" aria-hidden="true">{itemCount}</span> : null}
  </Link>;
}
