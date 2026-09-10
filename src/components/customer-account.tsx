import {
  IconArrowRight,
  IconMail,
  IconReceipt,
  IconShieldCheck,
  IconShoppingBag,
  IconTruckDelivery,
  IconUserCircle,
} from "@tabler/icons-react";
import Link from "next/link";

import type { SessionUser } from "@/lib/auth/roles";

export function CustomerAccount({ user }: { user: SessionUser }) {
  return <section className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12" aria-labelledby="customer-account-title">
    <header className="max-w-2xl">
      <h1 id="customer-account-title" className="text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Mi cuenta</h1>
      <p className="mt-3 text-pretty leading-7 text-[var(--muted)]">Un espacio breve para reconocer tu acceso y volver a lo que importa: comprar, revisar pedidos y seguir entregas.</p>
    </header>

    <div className="mt-9 grid gap-5 lg:grid-cols-[minmax(0,1.22fr)_minmax(18rem,0.78fr)]">
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7" aria-labelledby="customer-purchases-title">
        <div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><IconReceipt size={22} aria-hidden="true" /></span><div><h2 id="customer-purchases-title" className="text-xl font-semibold tracking-[-0.025em]">Compras y entregas</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">Cada compra confirmada concentra sus artículos, importe y avance de entrega en un mismo recorrido.</p></div></div>
        <div className="mt-7 grid gap-3 border-y border-[var(--line)] py-5 sm:grid-cols-2 sm:gap-5"><div className="flex gap-3"><IconShoppingBag className="mt-0.5 shrink-0 text-[var(--accent-strong)]" size={18} aria-hidden="true" /><p className="text-sm leading-6"><span className="block font-semibold">Revisa tus compras</span><span className="text-[var(--muted)]">Consulta productos, variantes y totales confirmados.</span></p></div><div className="flex gap-3"><IconTruckDelivery className="mt-0.5 shrink-0 text-[var(--accent-strong)]" size={18} aria-hidden="true" /><p className="text-sm leading-6"><span className="block font-semibold">Sigue la entrega</span><span className="text-[var(--muted)]">Ve preparación, envío o entrega sin datos privados de reparto.</span></p></div></div>
        <div className="mt-5 flex flex-wrap items-center gap-3"><Link href="/orders" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]"><IconArrowRight size={17} aria-hidden="true" />Ver pedidos y entregas</Link><Link href="/" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]">Explorar catálogo</Link></div>
      </section>

      <aside className="rounded-2xl bg-[var(--surface-muted)] p-5 sm:p-7" aria-labelledby="customer-access-title">
        <IconShieldCheck className="text-[var(--accent)]" size={24} aria-hidden="true" />
        <h2 id="customer-access-title" className="mt-5 text-xl font-semibold tracking-[-0.025em]">Tu acceso</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Esta sesión usa permisos de cliente. Las acciones de compra y consulta se validan otra vez en el servidor.</p>
        <div className="mt-7 border-y border-[var(--line)] py-4"><div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--surface)] text-[var(--accent-strong)]"><IconUserCircle size={21} aria-hidden="true" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold" title={user.name}>{user.name}</p><p className="mt-0.5 text-xs text-[var(--muted)]">Cuenta de cliente</p></div></div><div className="mt-4 flex items-start gap-3"><IconMail className="mt-0.5 shrink-0 text-[var(--accent-strong)]" size={18} aria-hidden="true" /><div className="min-w-0"><p className="text-xs font-semibold text-[var(--muted)]">Correo de acceso</p><p className="mt-1 break-words text-sm">{user.email}</p></div></div></div>
        <p className="mt-5 text-sm leading-6 text-[var(--muted)]">Puedes cerrar esta sesión desde el encabezado cuando termines.</p>
      </aside>
    </div>
  </section>;
}
