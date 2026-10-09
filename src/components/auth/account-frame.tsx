import Link from "next/link";
import type { ReactNode } from "react";

export function AccountFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className="grid min-h-[100dvh] bg-[var(--page)] px-4 py-6 text-[var(--ink)] sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(26rem,0.9fr)] lg:p-8">
    <aside className="hidden min-h-full flex-col justify-between rounded-2xl bg-[var(--ink)] p-10 text-[var(--surface)] lg:flex">
      <Link href="/" className="text-lg font-semibold tracking-[-0.035em]">departamental.</Link>
      <div className="max-w-lg"><h2 className="text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.04em]">Tu cuenta, el siguiente paso.</h2><p className="mt-5 max-w-md text-base leading-7">Compra y consulta tus pedidos con tu cuenta de cliente. Si eres empleado, utiliza la invitación enviada por tu administrador.</p></div>
      <Link href="/" className="min-h-11 content-center text-sm underline underline-offset-4">Volver al catálogo</Link>
    </aside>
    <section aria-labelledby="account-title" className="mx-auto flex w-full max-w-md flex-col justify-center py-10 lg:px-10">
      <Link href="/" className="mb-10 text-lg font-semibold tracking-[-0.035em] lg:hidden">departamental.</Link>
      <h1 id="account-title" className="text-3xl font-semibold tracking-[-0.035em]">{title}</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{description}</p><div className="mt-8">{children}</div>
    </section>
  </main>;
}
