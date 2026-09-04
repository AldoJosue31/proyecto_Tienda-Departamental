"use client";

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { IconChartBar, IconDatabaseOff, IconReceipt2, IconRefresh, IconShoppingBag, IconTrendingUp } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { AnalyticsDashboard, AnalyticsPeriod } from "@/lib/analytics/dashboard-types";

ChartJS.register(ArcElement, BarElement, CategoryScale, Legend, LinearScale, Title, Tooltip);

const periodOptions: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: "today", label: "Hoy" }, { value: "7d", label: "7 días" }, { value: "30d", label: "30 días" },
];
const limitOptions = [5, 10, 20] as const;
const chartPalette = ["#2563eb", "#4f46e5", "#0891b2", "#0f766e", "#7c3aed", "#c2410c", "#be185d", "#4d7c0f"];

function formatCurrency(value: number, currency: string) { return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Aún sin proyecciones"; }

async function requestDashboard(period: AnalyticsPeriod, limit: 5 | 10 | 20): Promise<AnalyticsDashboard> {
  const response = await fetch(`/api/dashboard/analytics?${new URLSearchParams({ period, limit: String(limit) })}`, { cache: "no-store" });
  const body = await response.json().catch(() => null) as { message?: unknown } | null;
  if (!response.ok) throw new Error(typeof body?.message === "string" ? body.message : "No se pudo cargar Analytics.");
  return body as AnalyticsDashboard;
}

export function AnalyticsDashboardView({ initialAnalytics }: { initialAnalytics: AnalyticsDashboard | null }) {
  const [period, setPeriod] = useState<AnalyticsPeriod>(initialAnalytics?.ticketAverage.period ?? "today");
  const [limit, setLimit] = useState<5 | 10 | 20>(initialAnalytics?.topProducts.limit ?? 5);
  const analytics = useQuery({
    queryKey: ["analytics-dashboard", period, limit],
    queryFn: () => requestDashboard(period, limit),
    initialData: initialAnalytics && period === initialAnalytics.ticketAverage.period && limit === initialAnalytics.topProducts.limit ? initialAnalytics : undefined,
    staleTime: 15_000,
  });
  const data = analytics.data;

  return (
    <section className="mt-8" aria-labelledby="analytics-title" aria-busy={analytics.isFetching}>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--accent-strong)]"><IconChartBar size={18} aria-hidden="true" />Indicadores de desempeño</div>
          <h2 id="analytics-title" className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Ventas e inventario en contexto</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Proyecciones independientes de Analytics Service. Los pedidos siguen operando aunque el reporte tenga retraso.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label="Controles del reporte">
          <div className="inline-flex rounded-xl bg-[var(--surface-muted)] p-1" role="group" aria-label="Periodo">
            {periodOptions.map((option) => <button key={option.value} type="button" onClick={() => setPeriod(option.value)} className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition-colors ${period === option.value ? "bg-[var(--surface)] text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]"}`} aria-pressed={period === option.value}>{option.label}</button>)}
          </div>
          <label className="sr-only" htmlFor="top-limit">Productos del ranking</label>
          <select id="top-limit" value={limit} onChange={(event) => setLimit(Number(event.target.value) as 5 | 10 | 20)} className="min-h-10 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-semibold">
            {limitOptions.map((option) => <option key={option} value={option}>Top {option}</option>)}
          </select>
          <button type="button" onClick={() => void analytics.refetch()} disabled={analytics.isFetching} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"><IconRefresh className={analytics.isFetching ? "animate-spin motion-reduce:animate-none" : undefined} size={17} aria-hidden="true" />Actualizar</button>
        </div>
      </div>

      {analytics.isLoading ? <AnalyticsLoading /> : analytics.error || !data ? <AnalyticsUnavailable message={analytics.error instanceof Error ? analytics.error.message : "El reporte no está disponible en este momento."} retry={() => void analytics.refetch()} /> : <AnalyticsContent data={data} />}
    </section>
  );
}

function AnalyticsContent({ data }: { data: AnalyticsDashboard }) {
  const lastUpdatedAt = [data.salesToday.lastUpdatedAt, data.ticketAverage.lastUpdatedAt, data.salesByBranch.lastUpdatedAt, data.topProducts.lastUpdatedAt, data.inventoryByBranch.lastUpdatedAt].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  const branchesHaveSales = data.salesByBranch.branches.some((branch) => branch.sales > 0);
  const productsHaveSales = data.topProducts.products.length > 0;
  const inventoryHasData = data.inventoryByBranch.branches.some((branch) => branch.onHand > 0 || branch.reserved > 0);
  return <>
    <p className="mt-4 text-sm text-[var(--muted)]" aria-live="polite">Última proyección: {formatDate(lastUpdatedAt)} · Zona horaria: America/Mexico_City</p>
    <dl className="mt-5 grid overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] divide-y divide-[var(--line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <Metric label="Ventas hoy" value={formatCurrency(data.salesToday.sales, data.salesToday.currency)} detail={`${data.salesToday.completedOrders} tickets completados`} icon={<IconTrendingUp size={18} aria-hidden="true" />} />
      <Metric label="Ticket promedio" value={formatCurrency(data.ticketAverage.ticketAverage, data.ticketAverage.currency)} detail={data.ticketAverage.formula} icon={<IconReceipt2 size={18} aria-hidden="true" />} />
      <Metric label="Unidades destacadas" value={String(data.topProducts.products.reduce((sum, product) => sum + product.unitsSold, 0))} detail={`Top ${data.topProducts.limit} del periodo`} icon={<IconShoppingBag size={18} aria-hidden="true" />} />
    </dl>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <ChartPanel title="Ventas por sucursal" description="Importe de ventas completadas por tienda durante el periodo visible.">
        {branchesHaveSales ? <Bar aria-label="Gráfica de barras de ventas por sucursal" role="img" data={{ labels: data.salesByBranch.branches.map((item) => item.branchName), datasets: [{ label: "Ventas", data: data.salesByBranch.branches.map((item) => item.sales), backgroundColor: "#2563eb", borderRadius: 7, maxBarThickness: 56 }] }} options={barOptions(data.salesByBranch.currency)} /> : <EmptyChart icon={<IconChartBar size={28} aria-hidden="true" />} title="Aún no hay ventas en este periodo" detail="Las sucursales aparecerán con sus importes cuando Analytics procese pedidos completados." />}
      </ChartPanel>
      <ChartPanel title="Stock por sucursal" description="Distribución actual de unidades físicas por sucursal.">
        {inventoryHasData ? <Doughnut aria-label="Gráfica de distribución de inventario por sucursal" role="img" data={{ labels: data.inventoryByBranch.branches.map((item) => item.branchName), datasets: [{ label: "Existencia física", data: data.inventoryByBranch.branches.map((item) => item.onHand), backgroundColor: data.inventoryByBranch.branches.map((_, index) => chartPalette[index % chartPalette.length]), borderWidth: 0, hoverOffset: 5 }] }} options={doughnutOptions} /> : <EmptyChart icon={<IconDatabaseOff size={28} aria-hidden="true" />} title="Inventario sin proyección" detail="Los gráficos se poblarán con los siguientes movimientos de stock publicados por Inventory." />}
      </ChartPanel>
    </div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <ChartPanel title="Top productos" description={`Ranking por unidades vendidas · ${periodLabel(data.topProducts.period)}.`}>
        {productsHaveSales ? <Bar aria-label="Gráfica horizontal de productos más vendidos" role="img" data={{ labels: data.topProducts.products.map((item) => item.productName), datasets: [{ label: "Unidades vendidas", data: data.topProducts.products.map((item) => item.unitsSold), backgroundColor: "#4f46e5", borderRadius: 7, maxBarThickness: 38 }] }} options={horizontalBarOptions} /> : <EmptyChart icon={<IconShoppingBag size={28} aria-hidden="true" />} title="Todavía no hay productos en el ranking" detail="Los pedidos cancelados no se incluyen; al completarse una venta, sus líneas se proyectarán aquí." />}
      </ChartPanel>
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6" aria-labelledby="inventory-brief-title">
        <h3 id="inventory-brief-title" className="font-semibold tracking-[-0.02em]">Lectura de inventario</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Existencia agregada desde la última proyección por sucursal.</p>
        {data.inventoryByBranch.branches.length === 0 ? <p className="mt-8 text-sm leading-6 text-[var(--muted)]">Sin sucursales proyectadas todavía.</p> : <ul className="mt-5 divide-y divide-[var(--line)]">{data.inventoryByBranch.branches.slice(0, 5).map((branch) => <li key={branch.branchId} className="flex items-center justify-between gap-4 py-3 first:pt-0"><div><p className="font-medium">{branch.branchName}</p><p className="mt-1 text-sm text-[var(--muted)]">{branch.reserved} reservadas</p></div><p className="text-right text-lg font-semibold tracking-[-0.025em]">{branch.available}<span className="ml-1 text-xs font-medium text-[var(--muted)]">disp.</span></p></li>)}</ul>}
      </section>
    </div>
  </>;
}

function Metric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) { return <div className="min-w-0 px-5 py-5 sm:px-6"><dt className="flex items-center gap-2 text-sm font-medium text-[var(--muted)]">{icon}{label}</dt><dd className="mt-3 text-2xl font-semibold tracking-[-0.035em]">{value}</dd><p className="mt-1 text-sm leading-5 text-[var(--muted)]">{detail}</p></div>; }
function ChartPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6" aria-label={title}><h3 className="font-semibold tracking-[-0.02em]">{title}</h3><p className="mt-1 text-sm leading-6 text-[var(--muted)]">{description}</p><div className="mt-5 h-72">{children}</div></section>; }
function EmptyChart({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) { return <div className="flex h-full flex-col items-center justify-center px-5 text-center"><span className="text-[var(--muted)]">{icon}</span><p className="mt-3 font-medium">{title}</p><p className="mt-1 max-w-sm text-sm leading-6 text-[var(--muted)]">{detail}</p></div>; }
function AnalyticsLoading() { return <div className="mt-6 grid gap-6 xl:grid-cols-2" aria-label="Cargando reportes"><div className="h-80 animate-pulse rounded-2xl bg-[var(--surface-muted)] motion-reduce:animate-none" /><div className="h-80 animate-pulse rounded-2xl bg-[var(--surface-muted)] motion-reduce:animate-none" /></div>; }
function AnalyticsUnavailable({ message, retry }: { message: string; retry: () => void }) { return <div role="alert" className="mt-6 rounded-2xl border border-[var(--warning)]/35 bg-[var(--warning-surface)] p-5"><p className="font-semibold">Analytics está temporalmente atrasado</p><p className="mt-1 text-sm leading-6">{message} Esto no afecta las ventas ni el inventario operativo.</p><button type="button" onClick={retry} className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--accent-soft)]">Reintentar reporte</button></div>; }
function periodLabel(period: AnalyticsPeriod) { return period === "today" ? "Hoy" : period === "7d" ? "Últimos 7 días" : "Últimos 30 días"; }

const barOptions = (currency: string) => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: "Ventas completadas" }, tooltip: { callbacks: { label: (item: { parsed: { y: number | null } }) => formatCurrency(item.parsed.y ?? 0, currency) } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: (value: string | number) => new Intl.NumberFormat("es-MX", { notation: "compact" }).format(Number(value)) } } } });
const horizontalBarOptions = { indexAxis: "y" as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: "Unidades vendidas" } }, scales: { x: { beginAtZero: true, grid: { color: "rgba(100, 116, 139, 0.18)" }, ticks: { precision: 0 } }, y: { grid: { display: false } } } };
const doughnutOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" as const, labels: { boxWidth: 10, usePointStyle: true } }, title: { display: true, text: "Existencia física" } }, cutout: "62%" };
