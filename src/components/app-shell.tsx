import Link from "next/link";
import type { ReactNode } from "react";

import { AccountMenu } from "@/components/account-menu";
import { SessionRefresher } from "@/components/auth/session-refresher";
import { CustomerBagLink, CustomerCartProvider } from "@/components/customer-cart-provider";
import { HeaderSearch } from "@/components/header-search";
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
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 py-3 lg:grid-cols-[auto_minmax(18rem,1fr)_auto] lg:gap-x-6">
            <Link href="/" aria-label="Departamental, inicio" className="col-start-1 row-start-1 inline-flex min-h-11 items-center text-base font-semibold tracking-[-0.035em] min-[380px]:text-lg lg:text-xl">departamental<span className="text-[var(--accent)]">.</span></Link>
            <div className="col-span-2 row-start-2 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-1"><HeaderSearch /></div>
            <div className="relative col-start-2 row-start-1 flex min-w-0 items-center justify-end gap-1 lg:col-start-3 lg:gap-2">
              {user ? <>
                <AccountMenu user={user} />
                <CustomerBagLink />
              </> : <Link href="/login?next=/" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]">Iniciar sesión</Link>}
            </div>
          </div>
        </div>
        <div className="border-t border-[var(--line)] bg-[var(--surface-muted)]"><div className="platform-frame"><NavigationMenu role={user?.role ?? null} /></div></div>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
      </div>
    </CustomerCartProvider>
  );
}
