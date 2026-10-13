import Image from "next/image";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { safeReturnPath } from "@/lib/auth/safe-return-path";

import loginProducts from "../../../public/catalog/login-products-v3.png";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const nextPath = safeReturnPath(next, "ADMIN");

  return (
    <main className="grid min-h-[100dvh] bg-[var(--page)] px-4 py-6 text-[var(--ink)] sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(26rem,0.9fr)] lg:p-8">
      <section
        className="relative isolate hidden min-h-[42rem] overflow-hidden rounded-2xl p-10 lg:flex lg:flex-col"
        style={{ backgroundColor: "white", color: "oklch(0.225 0.03 264)" }}
      >
        <div style={{ position: "absolute", inset: "2rem 0 0", display: "flex", alignItems: "flex-end", justifyContent: "center", pointerEvents: "none" }}>
          <Image
            src={loginProducts}
            alt="Silla de madera, lámpara de mesa, audífonos, tenis y reloj del catálogo sobre un fondo blanco."
            unoptimized
            loading="eager"
            style={{
              width: "auto",
              height: "auto",
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              maskImage: "linear-gradient(to right, transparent, white 4%, white 96%, transparent), linear-gradient(to bottom, transparent, white 10%, white 90%, transparent)",
              maskComposite: "intersect",
            }}
          />
        </div>
        <div className="relative">
          <Link href="/" className="text-lg font-semibold tracking-[-0.035em]" style={{ color: "inherit" }}>departamental<span style={{ color: "oklch(0.48 0.19 266)" }}>.</span></Link>
          <h1
            className="mt-8 max-w-lg text-balance font-semibold leading-[1.05] tracking-[-0.04em]"
            style={{ color: "inherit", fontSize: "clamp(1.875rem, 3.4vw, 3rem)" }}
          >Todo lo que te gusta, en un solo lugar.</h1>
        </div>
      </section>
      <section className="mx-auto flex w-full max-w-md flex-col justify-center py-10 lg:px-10">
        <Link href="/" className="text-lg font-semibold tracking-[-0.035em] lg:hidden">departamental<span className="text-[var(--accent)]">.</span></Link>
        <div className="mt-12 lg:mt-0">
          <h1 className="text-3xl font-semibold tracking-[-0.035em]">Inicia sesión</h1>
          <LoginForm nextPath={nextPath} />
          <p className="mt-6 text-sm leading-6 text-[var(--muted)]">¿Quieres comprar con una cuenta nueva? <Link href={`/register?next=${encodeURIComponent(nextPath)}`} className="inline-flex min-h-11 items-center font-semibold text-[var(--accent-strong)] underline underline-offset-4">Crear cuenta</Link></p>
        </div>
      </section>
    </main>
  );
}
