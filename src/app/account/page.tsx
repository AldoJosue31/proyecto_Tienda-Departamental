import { IconReceipt, IconShieldCheck, IconUserCircle } from "@tabler/icons-react";

import { AppShell } from "@/components/app-shell";
import { roleLabel } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session.server";
import { getCustomerShipments } from "@/lib/logistics/pick-pack.server";

export default async function AccountPage() {
  const user = await requireUser("/account");
  const deliveries = user.role === "CUSTOMER" ? await getCustomerShipments().catch(() => null) : null;

  return (
    <AppShell user={user} activePath="/account">
      <section className="mx-auto max-w-[980px] px-4 py-9 sm:px-6 lg:px-8 lg:py-12">
        <p className="text-sm font-semibold text-[var(--accent-strong)]">Mi cuenta</p>
        <h1 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Sesión y permisos</h1>
        <div className="mt-8 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]">
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><IconUserCircle size={23} aria-hidden="true" /></span><div><h2 className="font-semibold">{user.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">{user.email}</p></div></div><dl className="mt-7 divide-y divide-[var(--line)] border-y border-[var(--line)]"><div className="flex items-center justify-between gap-4 py-3.5"><dt className="text-sm text-[var(--muted)]">Perfil</dt><dd className="text-sm font-semibold">{roleLabel[user.role]}</dd></div><div className="flex items-center justify-between gap-4 py-3.5"><dt className="text-sm text-[var(--muted)]">Identidad</dt><dd className="font-mono text-xs">{user.id}</dd></div></dl></section>
          <aside className="rounded-2xl bg-[var(--surface-muted)] p-6"><IconShieldCheck className="text-[var(--accent)]" size={23} aria-hidden="true" /><h2 className="mt-5 font-semibold">Acceso protegido</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Tus permisos se verifican antes de renderizar las rutas privadas y nuevamente en las APIs protegidas.</p><div className="mt-7 flex items-start gap-3"><IconReceipt className="mt-0.5 text-[var(--accent)]" size={19} aria-hidden="true" /><p className="text-sm leading-6 text-[var(--muted)]">El historial de pedidos propios llega en la fase 5, desde Order Service.</p></div></aside>
        </div>
        {user.role === "CUSTOMER" ? <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6" aria-labelledby="deliveries-title"><div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><IconReceipt size={20} aria-hidden="true" /></span><div><h2 id="deliveries-title" className="font-semibold">Mis entregas</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Consulta el avance de tus compras. La ubicación del repartidor no se comparte en esta vista.</p></div></div>{!deliveries ? <p className="mt-5 text-sm leading-6 text-[var(--muted)]">Las entregas no están disponibles temporalmente. Puedes intentarlo más tarde.</p> : deliveries.shipments.length === 0 ? <p className="mt-5 text-sm leading-6 text-[var(--muted)]">Aún no hay envíos asociados a tu cuenta.</p> : <ul className="mt-5 divide-y divide-[var(--line)]">{deliveries.shipments.map((shipment) => <li key={shipment.id} className="flex flex-col gap-2 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-xs font-semibold text-[var(--accent-strong)]">PEDIDO-{shipment.orderId.slice(0, 8).toUpperCase()}</p><p className="mt-1 text-sm font-semibold">{customerStatus(shipment.status)}</p></div><p className="text-sm text-[var(--muted)]">Actualizado {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(shipment.updatedAt))}</p></li>)}</ul>}</section> : null}
      </section>
    </AppShell>
  );
}

function customerStatus(status: "PENDING" | "PACKING" | "SHIPPED" | "DELIVERED" | "CANCELLED") {
  return status === "PENDING" ? "Preparación pendiente" : status === "PACKING" ? "En preparación" : status === "SHIPPED" ? "Enviado" : status === "DELIVERED" ? "Entregado" : "Cancelado";
}
