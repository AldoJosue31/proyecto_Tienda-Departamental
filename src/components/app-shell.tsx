import Link from "next/link";
import type { ReactNode } from "react";

import { AccountMenu } from "@/components/account-menu";
import { SessionRefresher } from "@/components/auth/session-refresher";
import { CustomerBagLink, CustomerCartProvider } from "@/components/customer-cart-provider";
import { NavigationMenu } from "@/components/navigation-menu";
import type { SessionUser } from "@/lib/auth/roles";

export function AppShell({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  return (
    <CustomerCartProvider customerId={user?.role === "CUSTOMER" ? user.id : null}>
      <div className="min-h-[100dvh] bg-[var(--page)] text-[var(--ink)]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--surface)] focus:p-3">Saltar al contenido</a>
      {user && <SessionRefresher />}
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="platform-frame">
          <div className="flex min-h-18 items-center justify-between gap-3 py-3">
            <Link href="/" aria-label="Departamental, inicio" className="inline-flex min-h-11 shrink-0 items-center text-base font-semibold tracking-[-0.035em] min-[380px]:text-lg">departamental<span className="text-[var(--accent)]">.</span></Link>
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
              {user ? <>
                <CustomerBagLink />
                <AccountMenu user={user} />
              </> : <Link href="/login?next=/" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]">Iniciar sesión</Link>}
            </div>
          </div>
          <NavigationMenu role={user?.role ?? null} />
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
      </div>
    </CustomerCartProvider>
  );
}
