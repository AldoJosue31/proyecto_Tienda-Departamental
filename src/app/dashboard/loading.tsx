export default function DashboardLoading() {
  return (
    <main className="min-h-[100dvh] bg-[var(--page)] px-4 py-8 sm:px-6 lg:px-8" aria-busy="true" aria-label="Cargando inventario">
      <div className="mx-auto max-w-[1400px] animate-pulse motion-reduce:animate-none">
        <div className="h-10 w-48 rounded-xl bg-[var(--surface-muted)]" />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-36 rounded-2xl bg-[var(--surface-muted)]" />)}</div>
        <div className="mt-8 grid gap-6 xl:grid-cols-[1.45fr_0.85fr]"><div className="h-96 rounded-2xl bg-[var(--surface-muted)]" /><div className="h-96 rounded-2xl bg-[var(--surface-muted)]" /></div>
      </div>
    </main>
  );
}
