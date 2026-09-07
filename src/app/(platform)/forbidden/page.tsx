import { IconArrowLeft, IconLockAccess } from "@tabler/icons-react";
import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="grid place-items-center px-4 py-12 text-[var(--ink)]">
      <section className="w-full max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-7 sm:p-9"><span className="grid size-12 place-items-center rounded-xl bg-[var(--danger-surface)] text-[var(--danger)]"><IconLockAccess size={24} aria-hidden="true" /></span><p className="mt-7 text-sm font-semibold text-[var(--danger)]">Acceso restringido</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Tu rol no puede abrir esta área.</h1><p className="mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">La navegación y la verificación del servidor aplican los permisos definidos para ADMIN, EMPLOYEE y CUSTOMER.</p><Link href="/account" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-[var(--surface)] transition-colors hover:bg-[var(--accent-strong)]"><IconArrowLeft size={17} aria-hidden="true" />Volver a mi cuenta</Link></section>
    </div>
  );
}
