"use client";

import { IconShoppingBag } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  consumeCustomerCart,
  customerCartItemCount,
  customerCartStorageKey,
  GUEST_CART_KEY,
  loadShoppingCart,
  removeCustomerCartLine,
  reviseCustomerCart,
  type CustomerCartLine,
} from "@/lib/cart/customer-cart";

type CustomerCartContextValue = {
  customerId: string | null;
  available: boolean;
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

export function CustomerCartProvider({ customerId, guestEnabled = false, children }: { customerId: string | null; guestEnabled?: boolean; children: ReactNode }) {
  const cartOwner = customerId ?? (guestEnabled ? "guest" : null);
  const [lines, setLines] = useState<CustomerCartLine[]>([]);
  const [readyForCustomer, setReadyForCustomer] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (!cartOwner) {
        setLines([]);
        setReadyForCustomer(null);
        return;
      }
      try {
        setLines(loadShoppingCart(window.localStorage, customerId, guestEnabled));
      } catch {
        setLines([]);
      }
      setReadyForCustomer(cartOwner);
    });
    return () => { active = false; };
  }, [cartOwner, customerId, guestEnabled]);

  useEffect(() => {
    if (!cartOwner || readyForCustomer !== cartOwner) return;
    try {
      window.localStorage.setItem(customerId ? customerCartStorageKey(customerId) : GUEST_CART_KEY, JSON.stringify(lines));
    } catch {
      // Storage can be unavailable in privacy-restricted browsers. The in-memory
      // cart remains usable and server-side validation still protects checkout.
    }
  }, [cartOwner, customerId, lines, readyForCustomer]);

  const add = useCallback((input: Pick<CustomerCartLine, "productId" | "variantId">) => {
    if (!cartOwner || readyForCustomer !== cartOwner) return false;
    const next = reviseCustomerCart(lines, input, 1);
    if (next === lines) return false;
    setLines(next);
    return true;
  }, [cartOwner, lines, readyForCustomer]);
  const revise = useCallback((input: Pick<CustomerCartLine, "productId" | "variantId">, delta: number) => {
    if (!cartOwner) return;
    setLines((current) => reviseCustomerCart(current, input, delta));
  }, [cartOwner]);
  const remove = useCallback((variantId: string) => setLines((current) => removeCustomerCartLine(current, variantId)), []);
  const consume = useCallback((sentLines: CustomerCartLine[]) => {
    setLines((current) => consumeCustomerCart(current, sentLines));
  }, []);
  const clear = useCallback(() => setLines([]), []);
  const value = useMemo<CustomerCartContextValue>(() => ({
    customerId,
    available: cartOwner !== null,
    lines,
    itemCount: customerCartItemCount(lines),
    ready: cartOwner === null || readyForCustomer === cartOwner,
    add,
    revise,
    remove,
    consume,
    clear,
  }), [add, cartOwner, clear, consume, customerId, lines, readyForCustomer, remove, revise]);

  return <CustomerCartContext.Provider value={value}>{children}</CustomerCartContext.Provider>;
}

export function useCustomerCart() {
  const value = useContext(CustomerCartContext);
  if (!value) throw new Error("CustomerCartProvider is required to use the customer cart.");
  return value;
}

export function CustomerBagLink() {
  const pathname = usePathname();
  const { available, itemCount, ready } = useCustomerCart();
  if (!available) return null;

  const label = ready && itemCount > 0 ? `Bolsa, ${itemCount} artículos` : "Bolsa";
  return <Link href="/checkout" aria-current={pathname === "/checkout" ? "page" : undefined} aria-label={label} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-2.5 text-sm font-semibold transition-colors sm:px-3 ${pathname === "/checkout" ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "text-[var(--ink)] hover:bg-[var(--surface-muted)]"}`}>
    <IconShoppingBag size={21} stroke={1.8} aria-hidden="true" />
    <span className="hidden sm:inline">Bolsa</span>
    {ready && itemCount > 0 ? <span className="grid min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-xs font-bold text-white" aria-hidden="true">{itemCount}</span> : null}
  </Link>;
}
