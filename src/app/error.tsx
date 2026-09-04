"use client";

export default function Error({ reset }: { reset: () => void }) {
  return <main className="grid min-h-[100dvh] place-items-center bg-[var(--page)] p-6 text-[var(--ink)]"><div className="max-w-md text-center"><h1 className="text-2xl font-semibold tracking-[-0.04em]">No pudimos cargar esta vista</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Intenta actualizar. Si el problema continúa, revisa la conexión con los servicios locales.</p><button type="button" onClick={reset} className="mt-6 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.98]">Intentar de nuevo</button></div></main>;
}
