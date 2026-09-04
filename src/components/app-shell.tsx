import { IconBuildingStore, IconLayoutDashboard, IconLogout, IconPackage, IconUserCircle } from "@tabler/icons-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { signOut } from "@/app/login/actions";
import { SessionRefresher } from "@/components/auth/session-refresher";
import { roleLabel, type SessionUser } from "@/lib/auth/roles";

type Destination = {
  href: string;
  label: string;
  icon: typeof IconBuildingStore;
  roles: SessionUser["role"][];
};

const destinations: Destination[] = [
  { href: "/", label: "Catálogo", icon: IconBuildingStore, roles: ["ADMIN", "EMPLOYEE", "CUSTOMER"] },
  { href: "/catalog/manage", label: "Gestionar", icon: IconBuildingStore, roles: ["ADMIN"] },
  { href: "/account", label: "Mi cuenta", icon: IconUserCircle, roles: ["ADMIN", "EMPLOYEE", "CUSTOMER"] },
  { href: "/dashboard", label: "Administración", icon: IconLayoutDashboard, roles: ["ADMIN"] },
  { href: "/operations", label: "Operación", icon: IconPackage, roles: ["ADMIN", "EMPLOYEE"] },
];

export function AppShell({ user, activePath, children }: { user: SessionUser; activePath: string; children: ReactNode }) {
  const navigation = destinations.filter((destination) => destination.roles.includes(user.role));

  return (
    <main className="min-h-[100dvh] bg-[var(--page)] pb-24 text-[var(--ink)] md:pb-0">
      <SessionRefresher />
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="mr-auto text-lg font-semibold tracking-[-0.035em]">departamental<span className="text-[var(--accent)]">.</span></Link>
          <nav className="hidden items-center gap-1 rounded-xl bg-[var(--surface-muted)] p-1 md:flex" aria-label="Principal">
            {navigation.map(({ href, label }) => <Link key={href} href={href} aria-current={activePath === href ? "page" : undefined} className={`min-h-10 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${activePath === href ? "bg-[var(--surface)] text-[var(--ink)]" : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"}`}>{label}</Link>)}
          </nav>
          <div className="hidden text-right sm:block"><p className="text-sm font-semibold">{user.name}</p><p className="text-xs text-[var(--muted)]">{roleLabel[user.role]}</p></div>
          <form action={signOut}><button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"><IconLogout size={17} aria-hidden="true" /><span className="hidden sm:inline">Salir</span></button></form>
        </div>
      </header>
      {children}
      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-flow-col auto-cols-fr rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[0_5px_8px_rgb(18_29_57_/_0.12)] md:hidden" aria-label="Principal">
        {navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={activePath === href ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-semibold ${activePath === href ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "text-[var(--muted)]"}`}><Icon size={18} aria-hidden="true" />{label}</Link>)}
      </nav>
    </main>
  );
}
