import { IconReceipt, IconShieldCheck, IconUserCircle } from "@tabler/icons-react";

import { AppShell } from "@/components/app-shell";
import { roleLabel } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session.server";

export default async function AccountPage() {
  const user = await requireUser("/account");

  return (
    <AppShell user={user} activePath="/account">
      <section className="mx-auto max-w-[980px] px-4 py-9 sm:px-6 lg:px-8 lg:py-12">
        <p className="text-sm font-semibold text-[var(--accent-strong)]">Mi cuenta</p>
        <h1 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Sesión y permisos</h1>
        <div className="mt-8 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]">
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><IconUserCircle size={23} aria-hidden="true" /></span><div><h2 className="font-semibold">{user.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">{user.email}</p></div></div><dl className="mt-7 divide-y divide-[var(--line)] border-y border-[var(--line)]"><div className="flex items-center justify-between gap-4 py-3.5"><dt className="text-sm text-[var(--muted)]">Perfil</dt><dd className="text-sm font-semibold">{roleLabel[user.role]}</dd></div><div className="flex items-center justify-between gap-4 py-3.5"><dt className="text-sm text-[var(--muted)]">Identidad</dt><dd className="font-mono text-xs">{user.id}</dd></div></dl></section>
          <aside className="rounded-2xl bg-[var(--surface-muted)] p-6"><IconShieldCheck className="text-[var(--accent)]" size={23} aria-hidden="true" /><h2 className="mt-5 font-semibold">Acceso protegido</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Tus permisos se verifican antes de renderizar las rutas privadas y nuevamente en las APIs protegidas.</p><div className="mt-7 flex items-start gap-3"><IconReceipt className="mt-0.5 text-[var(--accent)]" size={19} aria-hidden="true" /><p className="text-sm leading-6 text-[var(--muted)]">El historial de pedidos propios llega en la fase 5, desde Order Service.</p></div></aside>
        </div>
      </section>
    </AppShell>
  );
}
