"use client";

import {
  IconAlertTriangle,
  IconBuildingStore,
  IconPackage,
  IconRefresh,
  IconWifi,
  IconWifiOff,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { sileo } from "sileo";
import { io, type Socket } from "socket.io-client";

import { AnalyticsDashboardView } from "@/components/analytics-dashboard";
import type { AnalyticsDashboard } from "@/lib/analytics/dashboard-types";
import type {
  InventoryDashboard,
  InventoryDashboardItem,
  StockUpdatedEvent,
} from "@/lib/inventory/dashboard-types";

type RealtimeStatus = "connecting" | "connected" | "fallback";

const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8000";

async function requestDashboard(branchId: string): Promise<InventoryDashboard> {
  const response = await fetch(`/api/dashboard/inventory?branchId=${encodeURIComponent(branchId)}`, {
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as { message?: unknown } | null;
  if (!response.ok) {
    throw new Error(typeof body?.message === "string" ? body.message : "No se pudo cargar el inventario.");
  }
  return body as unknown as InventoryDashboard;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function stockState(item: InventoryDashboardItem) {
  if (item.available === 0) return { label: "AGOTADO", tone: "danger" as const };
  if (item.reorderPoint !== null && item.available <= item.reorderPoint) {
    return { label: "REABASTECER", tone: "danger" as const };
  }
  return { label: "EN STOCK", tone: "neutral" as const };
}

function statusCopy(status: RealtimeStatus) {
  if (status === "connected") return "Actualización en tiempo real activa";
  if (status === "connecting") return "Conectando a actualizaciones";
  return "Conexión interrumpida; usamos recarga de respaldo";
}

export function InventoryDashboardView({ initialDashboard, initialAnalytics }: { initialDashboard: InventoryDashboard; initialAnalytics: AnalyticsDashboard | null }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const [lastRealtimeAt, setLastRealtimeAt] = useState<string | null>(null);
  const activeBranchId = useRef(initialDashboard.branch.id);

  const updateDashboard = useCallback(async (branchId: string, announce = false) => {
    setIsDashboardLoading(true);
    setDashboardError(null);
    const request = requestDashboard(branchId);
    try {
      const nextDashboard = announce
        ? await sileo.promise(request, {
          loading: { title: "Actualizando inventario", description: "Consultamos los niveles más recientes." },
          success: { title: "Inventario actualizado", description: "La información de la sucursal está al día." },
          error: { title: "No se pudo actualizar", description: "Conservamos la última información disponible." },
        })
        : await request;
      activeBranchId.current = nextDashboard.branch.id;
      setDashboard(nextDashboard);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el inventario.";
      setDashboardError(`${message} Conservamos la última información disponible.`);
      if (!announce) sileo.error({ title: "Inventario sin actualizar", description: message });
    } finally {
      setIsDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    const socket: Socket = io(gatewayUrl, {
      path: "/realtime/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    const refreshCurrentBranch = (event: StockUpdatedEvent) => {
      if (event.branchId !== activeBranchId.current) return;
      setLastRealtimeAt(event.lastUpdatedAt);
      void updateDashboard(event.branchId);
    };
    const useFallback = () => {
      setRealtimeStatus("fallback");
      void updateDashboard(activeBranchId.current);
    };

    socket.on("connect", () => setRealtimeStatus("connected"));
    socket.on("disconnect", useFallback);
    socket.on("connect_error", useFallback);
    socket.on("stock.updated", refreshCurrentBranch);
    return () => {
      socket.off("connect");
      socket.off("disconnect", useFallback);
      socket.off("connect_error", useFallback);
      socket.off("stock.updated", refreshCurrentBranch);
      socket.disconnect();
    };
  }, [updateDashboard]);

  const lastUpdate = lastRealtimeAt ?? dashboard.generatedAt;
  const statusIcon = realtimeStatus === "fallback"
    ? <IconWifiOff size={16} aria-hidden="true" />
    : <IconWifi size={16} aria-hidden="true" />;

  return (
    <>

      <section className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10" aria-busy={isDashboardLoading}>
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-[var(--accent-strong)]">Operación de inventario</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${realtimeStatus === "fallback" ? "bg-[var(--warning-surface)] text-[var(--warning)]" : "bg-[var(--accent-soft)] text-[var(--accent-strong)]"}`} aria-live="polite">
                {statusIcon}{statusCopy(realtimeStatus)}
              </span>
            </div>
            <h1 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{dashboard.branch.name}</h1>
            <p className="mt-2 text-pretty text-sm leading-6 text-[var(--muted)]">Disponibilidad, reservas y puntos de reabastecimiento de esta sucursal.</p>
            <p className="mt-3 text-sm text-[var(--muted)]" aria-live="polite">Última sincronización: {formatDate(lastUpdate)}</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-end gap-3">
          <label className="block min-w-0">
            <span className="text-sm font-medium">Sucursal</span>
            <span className="relative mt-2 block">
              <IconBuildingStore className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} aria-hidden="true" />
              <select value={dashboard.branch.id} onChange={(event) => void updateDashboard(event.target.value)} disabled={isDashboardLoading} className="h-11 w-full max-w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] py-2 pl-10 pr-3 text-sm transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-55">
                {dashboard.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </span>
          </label>
          <button type="button" onClick={() => void updateDashboard(dashboard.branch.id, true)} disabled={isDashboardLoading} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--surface-muted)] px-4 py-2 text-sm font-medium transition-colors duration-200 hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-50">
            <IconRefresh className={isDashboardLoading ? "animate-spin motion-reduce:animate-none" : undefined} size={16} aria-hidden="true" />
            {isDashboardLoading ? "Actualizando" : "Actualizar"}
          </button>
          </div>
        </div>

        {dashboardError && <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--danger)]/35 bg-[var(--danger-surface)] px-4 py-3 text-sm"><span>{dashboardError}</span><button type="button" onClick={() => void updateDashboard(dashboard.branch.id, true)} className="font-semibold text-[var(--danger)] underline decoration-1 underline-offset-4">Reintentar</button></div>}

        <AnalyticsDashboardView initialAnalytics={initialAnalytics} />

        <section className="mt-8 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]" aria-label="Resumen de existencias">
          <dl className="grid divide-y divide-[var(--line)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5">
            <SummaryItem label="Existencia física" value={dashboard.summary.onHand} />
            <SummaryItem label="Comprometidas" value={dashboard.summary.reserved} />
            <SummaryItem label="Disponibles" value={dashboard.summary.available} emphasis />
            <SummaryItem label="Por reabastecer" value={dashboard.summary.lowStock} warning={dashboard.summary.lowStock > 0} />
            <SummaryItem label="Agotadas" value={dashboard.summary.outOfStock} warning={dashboard.summary.outOfStock > 0} />
          </dl>
        </section>

        <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6" aria-labelledby="critical-stock-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><IconAlertTriangle className="text-[var(--danger)]" size={19} aria-hidden="true" /><h2 id="critical-stock-title" className="font-semibold tracking-[-0.02em]">Atención prioritaria</h2></div>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Variantes cuyo disponible es igual o menor a su punto de pedido.</p>
            </div>
            <span className="rounded-full bg-[var(--danger-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--danger)]">{dashboard.lowStock.length} alertas</span>
          </div>
          {dashboard.lowStock.length === 0 ? <div className="mt-6 rounded-xl bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[var(--muted)]">No hay variantes que requieran reabastecimiento en esta sucursal.</div> : <LowStockList items={dashboard.lowStock} />}
        </section>

        <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)]" aria-labelledby="inventory-table-title">
          <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-5 sm:px-6">
            <div><h2 id="inventory-table-title" className="font-semibold tracking-[-0.02em]">Existencias por variante</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Datos oficiales de Inventory Service para {dashboard.branch.name}.</p></div>
            <span className="text-sm text-[var(--muted)]">{dashboard.items.length} variantes</span>
          </div>
          {dashboard.items.length === 0 ? <div className="border-t border-[var(--line)] px-5 py-10 text-center sm:px-6"><IconPackage className="mx-auto text-[var(--muted)]" size={26} aria-hidden="true" /><p className="mt-3 font-medium">Aún no hay existencias registradas</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[var(--muted)]">Cuando Inventory registre una variante en esta sucursal, aparecerá aquí y sus cambios se actualizarán automáticamente.</p></div> : <InventoryTable items={dashboard.items} />}
        </section>
      </section>

    </>
  );
}

function SummaryItem({ label, value, emphasis = false, warning = false }: { label: string; value: number; emphasis?: boolean; warning?: boolean }) {
  return <div className="min-w-0 px-5 py-4 sm:px-6"><dt className="text-sm font-medium text-[var(--muted)]">{label}</dt><dd className={`mt-2 text-2xl font-semibold tracking-[-0.035em] ${warning ? "text-[var(--danger)]" : emphasis ? "text-[var(--accent-strong)]" : ""}`}>{value}</dd></div>;
}

function LowStockList({ items }: { items: InventoryDashboardItem[] }) {
  return <><div className="mt-5 grid gap-3 md:hidden">{items.map((item) => <article key={item.id} className="rounded-xl border border-[var(--danger)]/28 bg-[var(--danger-surface)] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{item.product.productName}</h3><p className="mt-1 text-sm text-[var(--muted)]">{item.product.variantLabel} · <span className="font-mono text-xs">{item.product.sku}</span></p></div><StockBadge item={item} /></div><dl className="mt-4 grid grid-cols-3 gap-2 text-sm"><CompactData label="Sucursal" value={item.branch.name} /><CompactData label="Disponible" value={String(item.available)} /><CompactData label="Punto" value={String(item.reorderPoint)} /></dl></article>)}</div><div className="mt-5 hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-[var(--muted)]"><tr><th className="pb-3 font-medium">Producto</th><th className="pb-3 font-medium">SKU / variante</th><th className="pb-3 font-medium">Sucursal</th><th className="pb-3 text-right font-medium">Disponible</th><th className="pb-3 text-right font-medium">Punto de pedido</th><th className="pb-3 text-right font-medium">Estado</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t border-[var(--line)]"><td className="py-3.5 font-medium">{item.product.productName}</td><td className="py-3.5"><span className="block text-[var(--muted)]">{item.product.variantLabel}</span><span className="font-mono text-xs text-[var(--muted)]">{item.product.sku}</span></td><td className="py-3.5 text-[var(--muted)]">{item.branch.name}</td><td className="py-3.5 text-right font-semibold text-[var(--danger)]">{item.available}</td><td className="py-3.5 text-right text-[var(--muted)]">{item.reorderPoint}</td><td className="py-3.5 text-right"><StockBadge item={item} /></td></tr>)}</tbody></table></div></>;
}

function InventoryTable({ items }: { items: InventoryDashboardItem[] }) {
  return <><div className="grid divide-y divide-[var(--line)] md:hidden">{items.map((item) => <article key={item.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{item.product.productName}</h3><p className="mt-1 text-sm text-[var(--muted)]">{item.product.variantLabel}</p><p className="mt-1 font-mono text-xs text-[var(--muted)]">{item.product.sku}</p></div><StockBadge item={item} /></div><dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3"><CompactData label="Sucursal" value={item.branch.name} /><CompactData label="Existencia física" value={String(item.onHand)} /><CompactData label="Reservadas" value={String(item.reserved)} /><CompactData label="Disponibles" value={String(item.available)} strong /><CompactData label="Punto de pedido" value={item.reorderPoint === null ? "No definido" : String(item.reorderPoint)} /><CompactData label="Actualizado" value={formatDate(item.lastUpdatedAt)} /></dl></article>)}</div><div className="hidden overflow-x-auto border-t border-[var(--line)] md:block"><table className="w-full min-w-[960px] text-left text-sm"><thead className="bg-[var(--surface-muted)] text-[var(--muted)]"><tr><th className="px-6 py-3.5 font-medium">Producto</th><th className="px-4 py-3.5 font-medium">SKU / variante</th><th className="px-4 py-3.5 font-medium">Sucursal</th><th className="px-4 py-3.5 text-right font-medium">Físico</th><th className="px-4 py-3.5 text-right font-medium">Reservado</th><th className="px-4 py-3.5 text-right font-medium">Disponible</th><th className="px-4 py-3.5 text-right font-medium">Punto</th><th className="px-6 py-3.5 text-right font-medium">Estado</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t border-[var(--line)] transition-colors duration-200 hover:bg-[var(--surface-muted)]/60"><td className="px-6 py-4 font-medium">{item.product.productName}</td><td className="px-4 py-4"><span className="block text-[var(--muted)]">{item.product.variantLabel}</span><span className="font-mono text-xs text-[var(--muted)]">{item.product.sku}</span></td><td className="px-4 py-4 text-[var(--muted)]">{item.branch.name}</td><td className="px-4 py-4 text-right">{item.onHand}</td><td className="px-4 py-4 text-right">{item.reserved}</td><td className={`px-4 py-4 text-right font-semibold ${item.available === 0 ? "text-[var(--danger)]" : ""}`}>{item.available}</td><td className="px-4 py-4 text-right text-[var(--muted)]">{item.reorderPoint ?? "—"}</td><td className="px-6 py-4 text-right"><StockBadge item={item} /></td></tr>)}</tbody></table></div></>;
}

function CompactData({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div><dt className="text-xs font-medium text-[var(--muted)]">{label}</dt><dd className={`mt-1 text-sm ${strong ? "font-semibold" : ""}`}>{value}</dd></div>;
}

function StockBadge({ item }: { item: InventoryDashboardItem }) {
  const state = stockState(item);
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${state.tone === "danger" ? "bg-[var(--danger-surface)] text-[var(--danger)]" : "bg-[var(--surface-muted)] text-[var(--ink)]"}`}>{state.label}</span>;
}
