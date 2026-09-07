import { IconLogout } from "@tabler/icons-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { signOut } from "@/app/login/actions";
import { SessionRefresher } from "@/components/auth/session-refresher";
import { NavigationMenu } from "@/components/navigation-menu";
import { roleLabel, type SessionUser } from "@/lib/auth/roles";

export function AppShell({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[var(--page)] text-[var(--ink)]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--surface)] focus:p-3">Saltar al contenido</a>
      {user && <SessionRefresher />}
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-18 items-center justify-between gap-3 py-3">
            <Link href="/" aria-label="Departamental, inicio" className="inline-flex min-h-11 shrink-0 items-center text-lg font-semibold tracking-[-0.035em]">departamental<span className="text-[var(--accent)]">.</span></Link>
            <div className="flex min-w-0 items-center gap-3 sm:gap-5">
              {user ? <>
                <div className="hidden min-w-0 text-right sm:block"><p className="max-w-56 truncate text-sm font-semibold" title={user.name}>{user.name}</p><p className="text-xs text-[var(--muted)]">{roleLabel[user.role]}</p></div>
                <form action={signOut} className="shrink-0"><button type="submit" aria-label="Cerrar sesión" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"><IconLogout size={18} aria-hidden="true" /><span>Salir</span></button></form>
              </> : <Link href="/login?next=/" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]">Iniciar sesión</Link>}
            </div>
          </div>
          <NavigationMenu role={user?.role ?? null} />
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
    </div>
  );
}
