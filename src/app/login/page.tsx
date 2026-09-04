import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";

function safeNextPath(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(next);

  return (
    <main className="grid min-h-[100dvh] bg-[var(--page)] px-4 py-6 text-[var(--ink)] sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(26rem,0.9fr)] lg:p-8">
      <section className="hidden min-h-full flex-col justify-between rounded-2xl bg-[var(--ink)] p-10 text-[var(--surface)] lg:flex">
        <Link href="/" className="text-lg font-semibold tracking-[-0.035em]">departamental<span className="text-[var(--accent)]">.</span></Link>
        <div className="max-w-lg">
          <p className="text-sm font-semibold text-[var(--accent-soft)]">Acceso de plataforma</p>
          <h1 className="mt-4 text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.04em]">La misma operación, con permisos claros.</h1>
          <p className="mt-5 max-w-md text-pretty text-base leading-7 text-[color-mix(in_oklch,var(--surface)_74%,transparent)]">Administración, operación y compra comparten una entrada segura; cada persona encuentra únicamente las tareas que le corresponden.</p>
        </div>
        <p className="text-sm text-[color-mix(in_oklch,var(--surface)_64%,transparent)]">JWT, roles y trazabilidad protegidos por el API Gateway.</p>
      </section>
      <section className="mx-auto flex w-full max-w-md flex-col justify-center py-10 lg:px-10">
        <Link href="/" className="text-lg font-semibold tracking-[-0.035em] lg:hidden">departamental<span className="text-[var(--accent)]">.</span></Link>
        <div className="mt-12 lg:mt-0">
          <p className="text-sm font-semibold text-[var(--accent-strong)]">Bienvenido</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">Inicia sesión</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">Usa las credenciales asignadas para continuar con tus tareas.</p>
          <LoginForm nextPath={nextPath} />
        </div>
      </section>
    </main>
  );
}
