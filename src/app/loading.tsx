export default function Loading() {
  return <main className="min-h-[100dvh] bg-[var(--page)] p-6" aria-busy="true" aria-label="Cargando catálogo"><div className="mx-auto max-w-[1400px] animate-pulse motion-reduce:animate-none"><div className="h-8 w-40 rounded bg-[var(--surface-muted)]" /><div className="mt-12 h-14 max-w-lg rounded bg-[var(--surface-muted)]" /><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-80 rounded-2xl bg-[var(--surface-muted)]" />)}</div></div></main>;
}
