"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconAlertTriangle, IconBoxSeam, IconChevronRight, IconCircleCheck, IconClipboardCheck, IconClock, IconListDetails, IconPackage, IconRefresh, IconTruckDelivery } from "@tabler/icons-react";
import { useState } from "react";
import { sileo } from "sileo";
import type { PickPackDashboard, PickPackShipment, PickPackShipmentDetail, PickPackStatusInput } from "@/lib/logistics/pick-pack-types";

type BoardStatus = "PENDING" | "PACKING" | "SHIPPED";
const columns: Array<{ status: BoardStatus; title: string; description: string; empty: string }> = [
  { status: "PENDING", title: "Pendiente", description: "Por iniciar preparación", empty: "No hay pedidos esperando preparación." },
  { status: "PACKING", title: "Empacando", description: "En proceso de empaque", empty: "No hay pedidos en empaque." },
  { status: "SHIPPED", title: "Enviado", description: "Entregados a logística", empty: "No hay envíos registrados aún." },
];

async function readBody(response: Response): Promise<unknown> { return response.json().catch(() => null); }
async function requestDashboard(): Promise<PickPackDashboard> {
  const response = await fetch("/api/operations/shipments", { cache: "no-store" }); const body = await readBody(response) as { message?: unknown } | null;
  if (!response.ok) throw new Error(typeof body?.message === "string" ? body.message : "No se pudo cargar el tablero de preparación."); return body as PickPackDashboard;
}
async function requestDetail(id: string): Promise<PickPackShipmentDetail> {
  const response = await fetch(`/api/operations/shipments/${encodeURIComponent(id)}`, { cache: "no-store" }); const body = await readBody(response) as { message?: unknown } | null;
  if (!response.ok) throw new Error(typeof body?.message === "string" ? body.message : "No se pudo consultar el envío."); return body as PickPackShipmentDetail;
}
async function updateStatus(id: string, input: PickPackStatusInput): Promise<PickPackShipmentDetail> {
  const response = await fetch(`/api/operations/shipments/${encodeURIComponent(id)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(input) }); const body = await readBody(response) as { message?: unknown } | null;
  if (!response.ok) throw new Error(typeof body?.message === "string" ? body.message : "No se pudo actualizar el envío."); return body as PickPackShipmentDetail;
}

export function PickPackBoard({ initialDashboard }: { initialDashboard: PickPackDashboard | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(initialDashboard?.shipments[0]?.id ?? null);
  const queryClient = useQueryClient();
  const board = useQuery({ queryKey: ["pick-pack-board"], queryFn: requestDashboard, initialData: initialDashboard ?? undefined, staleTime: 10_000, refetchInterval: 15_000 });
  const detail = useQuery({ queryKey: ["pick-pack-shipment", selectedId], queryFn: () => requestDetail(selectedId ?? ""), enabled: Boolean(selectedId), staleTime: 10_000 });
  const mutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: PickPackStatusInput }) => updateStatus(id, input),
    onSuccess: (next) => {
      queryClient.setQueryData<PickPackDashboard>(["pick-pack-board"], (current) => current ? { ...current, refreshedAt: new Date().toISOString(), shipments: current.shipments.map((shipment) => shipment.id === next.shipment.id ? next.shipment : shipment) } : current);
      queryClient.setQueryData(["pick-pack-shipment", next.shipment.id], next);
      sileo.success({ title: "Estado actualizado", description: `${statusCopy(next.shipment.status)}. El tablero quedó sincronizado.` });
    },
    onError: (error) => sileo.error({ title: "No se pudo avanzar el envío", description: error instanceof Error ? error.message : "Actualiza el tablero e inténtalo de nuevo." }),
  });
  const data = board.data;
  const selected = detail.data?.shipment ?? data?.shipments.find((shipment) => shipment.id === selectedId) ?? null;

  return <section className="mt-8" aria-labelledby="pick-pack-title" aria-busy={board.isFetching}>
    <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
      <div className="max-w-2xl"><div className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]"><IconClipboardCheck size={18} aria-hidden="true" />Logistics Service</div><h1 id="pick-pack-title" className="mt-2 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Pick &amp; Pack</h1><p className="mt-3 text-pretty text-sm leading-6 text-[var(--muted)]">Consulta los envíos operativos, prepara cada pedido y registra el avance con transiciones verificadas.</p></div>
      <div className="flex flex-wrap items-center gap-2"><p className="mr-1 text-sm text-[var(--muted)]" aria-live="polite">{data ? `Sincronizado ${formatDate(data.refreshedAt)}` : "Conectando a operación"}</p><button type="button" onClick={() => void board.refetch()} disabled={board.isFetching} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"><IconRefresh className={board.isFetching ? "animate-spin motion-reduce:animate-none" : undefined} size={17} aria-hidden="true" />Actualizar</button></div>
    </div>
    <p className="mt-3 text-sm text-[var(--muted)]">El tablero se sincroniza cada 15 segundos. Las cancelaciones no aparecen en preparación.</p>
    {board.error || !data ? <Unavailable message={board.error instanceof Error ? board.error.message : "El tablero no está disponible."} retry={() => void board.refetch()} /> : <>
      <dl className="mt-6 grid divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] sm:grid-cols-3 sm:divide-x sm:divide-y-0"><Metric label="Pendientes" value={count(data, "PENDING")} tone="accent" /><Metric label="Empacando" value={count(data, "PACKING")} tone="warning" /><Metric label="Enviados" value={count(data, "SHIPPED")} tone="success" /></dl>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="overflow-x-auto pb-2"><div className="grid min-w-[850px] grid-cols-3 gap-4" aria-label="Tablero de preparación">{columns.map((column) => <BoardColumn key={column.status} column={column} shipments={data.shipments.filter((shipment) => shipment.status === column.status)} selectedId={selectedId} onSelect={setSelectedId} />)}</div></div>
        <ShipmentDetail shipment={selected} detail={detail.data} loading={detail.isLoading} updating={mutation.isPending} onAdvance={(shipment, status) => mutation.mutate({ id: shipment.id, input: { status, version: shipment.version } })} />
      </div>
    </>}
  </section>;
}

function BoardColumn({ column, shipments, selectedId, onSelect }: { column: (typeof columns)[number]; shipments: PickPackShipment[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const style = column.status === "PENDING" ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : column.status === "PACKING" ? "bg-[var(--warning-surface)] text-[var(--warning)]" : "bg-[var(--success-surface)] text-[var(--success)]";
  return <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)]/55 p-3" aria-labelledby={`column-${column.status}`}><header className="flex items-start justify-between gap-3 px-2 py-2"><div><h2 id={`column-${column.status}`} className="font-semibold tracking-[-0.02em]">{column.title}</h2><p className="mt-1 text-xs text-[var(--muted)]">{column.description}</p></div><span className={`inline-flex min-h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${style}`}>{shipments.length}</span></header><div className="mt-2 grid gap-3">{shipments.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-8 text-center text-sm leading-6 text-[var(--muted)]">{column.empty}</div> : shipments.map((shipment) => <ShipmentCard key={shipment.id} shipment={shipment} selected={shipment.id === selectedId} onSelect={onSelect} />)}</div></section>;
}

function ShipmentCard({ shipment, selected, onSelect }: { shipment: PickPackShipment; selected: boolean; onSelect: (id: string) => void }) {
  return <button type="button" onClick={() => onSelect(shipment.id)} aria-pressed={selected} className={`w-full rounded-xl border bg-[var(--surface)] p-4 text-left transition-colors duration-200 hover:border-[var(--accent)]/45 hover:bg-[var(--accent-soft)]/35 ${selected ? "border-[var(--accent)] ring-1 ring-[var(--accent)]/25" : "border-[var(--line)]"}`}><div className="flex items-start justify-between gap-3"><span className="font-mono text-xs font-semibold text-[var(--accent-strong)]">ENV-{shortId(shipment.id)}</span><IconChevronRight className="text-[var(--muted)]" size={17} aria-hidden="true" /></div><p className="mt-4 font-semibold tracking-[-0.015em]">Pedido {shortId(shipment.orderId)}</p><p className="mt-1 text-sm text-[var(--muted)]">Sucursal {shortId(shipment.branchId)} · {units(shipment)} u.</p><p className="mt-4 line-clamp-2 text-sm leading-5 text-[var(--muted)]">{shipment.items.slice(0, 2).map((item) => item.productName).join(" · ")}{shipment.items.length > 2 ? " · + más" : ""}</p></button>;
}

function ShipmentDetail({ shipment, detail, loading, updating, onAdvance }: { shipment: PickPackShipment | null; detail: PickPackShipmentDetail | undefined; loading: boolean; updating: boolean; onAdvance: (shipment: PickPackShipment, status: "PACKING" | "SHIPPED") => void }) {
  if (!shipment) return <aside className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-6 xl:sticky xl:top-6"><IconListDetails className="text-[var(--muted)]" size={25} aria-hidden="true" /><h2 className="mt-5 font-semibold">Selecciona un envío</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Abre una tarjeta para revisar artículos, historial y la siguiente acción permitida.</p></aside>;
  const next = nextStatus(shipment.status); const transitions = detail?.transitions ?? [];
  return <aside className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6 xl:sticky xl:top-6" aria-label={`Detalle del envío ${shortId(shipment.id)}`}><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-xs font-semibold text-[var(--accent-strong)]">ENV-{shortId(shipment.id)}</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Pedido {shortId(shipment.orderId)}</h2></div><StatusBadge status={shipment.status} /></div><dl className="mt-6 grid grid-cols-2 gap-4 border-y border-[var(--line)] py-4"><Data label="Sucursal" value={shortId(shipment.branchId)} /><Data label="Artículos" value={`${units(shipment)} unidades`} /><Data label="Estado" value={statusCopy(shipment.status)} /><Data label="Actualizado" value={formatDate(shipment.updatedAt)} /></dl><section className="mt-6"><h3 className="text-sm font-semibold">Contenido del pedido</h3><ul className="mt-3 divide-y divide-[var(--line)]">{shipment.items.map((item) => <li key={item.variantId} className="flex items-start justify-between gap-4 py-3 first:pt-0"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.productName}</p><p className="mt-1 truncate font-mono text-xs text-[var(--muted)]">{item.sku} · {item.variantLabel}</p></div><span className="shrink-0 text-sm font-semibold">×{item.quantity}</span></li>)}</ul></section><section className="mt-6"><h3 className="text-sm font-semibold">Historial operativo</h3>{loading ? <div className="mt-3 h-20 animate-pulse rounded-xl bg-[var(--surface-muted)] motion-reduce:animate-none" /> : transitions.length === 0 ? <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Aún no hay movimientos registrados.</p> : <ol className="mt-3 space-y-3">{transitions.slice(0, 4).map((transition) => <li key={transition.id} className="flex gap-3 text-sm"><span className="mt-0.5 rounded-full bg-[var(--surface-muted)] p-1 text-[var(--muted)]"><IconClock size={14} aria-hidden="true" /></span><p><span className="font-medium">{statusCopy(transition.toStatus)}</span><span className="text-[var(--muted)]"> · {formatDate(transition.createdAt)}</span></p></li>)}</ol>}</section>{next ? <button type="button" disabled={updating} onClick={() => onAdvance(shipment, next)} className="mt-7 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55"><IconChevronRight size={18} aria-hidden="true" />{updating ? "Guardando estado" : next === "PACKING" ? "Iniciar empaque" : "Marcar como enviado"}</button> : <p className="mt-7 flex items-center gap-2 rounded-xl bg-[var(--success-surface)] px-4 py-3 text-sm font-semibold text-[var(--success)]"><IconCircleCheck size={18} aria-hidden="true" />El envío ya está listo para seguimiento.</p>}</aside>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "accent" | "warning" | "success" }) { const icon = tone === "accent" ? <IconPackage size={18} aria-hidden="true" /> : tone === "warning" ? <IconBoxSeam size={18} aria-hidden="true" /> : <IconTruckDelivery size={18} aria-hidden="true" />; const color = tone === "accent" ? "text-[var(--accent-strong)]" : tone === "warning" ? "text-[var(--warning)]" : "text-[var(--success)]"; return <div className="px-5 py-4 sm:px-6"><dt className="flex items-center gap-2 text-sm font-medium text-[var(--muted)]">{icon}{label}</dt><dd className={`mt-2 text-2xl font-semibold tracking-[-0.035em] ${color}`}>{value}</dd></div>; }
function Data({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-medium text-[var(--muted)]">{label}</dt><dd className="mt-1 truncate text-sm font-medium">{value}</dd></div>; }
function StatusBadge({ status }: { status: PickPackShipment["status"] }) { const className = status === "PENDING" ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : status === "PACKING" ? "bg-[var(--warning-surface)] text-[var(--warning)]" : "bg-[var(--success-surface)] text-[var(--success)]"; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{statusCopy(status)}</span>; }
function Unavailable({ message, retry }: { message: string; retry: () => void }) { return <div role="alert" className="mt-6 rounded-2xl border border-[var(--warning)]/35 bg-[var(--warning-surface)] p-5"><div className="flex items-center gap-2 font-semibold"><IconAlertTriangle size={19} aria-hidden="true" />Operación temporalmente no disponible</div><p className="mt-2 text-sm leading-6">{message} Conservamos el acceso a las demás áreas de la plataforma.</p><button type="button" onClick={retry} className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-[var(--surface)] px-3 text-sm font-semibold transition-colors hover:bg-[var(--accent-soft)]">Reintentar</button></div>; }
function count(dashboard: PickPackDashboard, status: BoardStatus) { return dashboard.shipments.filter((shipment) => shipment.status === status).length; }
function units(shipment: PickPackShipment) { return shipment.items.reduce((total, item) => total + item.quantity, 0); }
function shortId(value: string) { return value.slice(0, 8).toUpperCase(); }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function statusCopy(status: PickPackShipment["status"]) { return status === "PENDING" ? "Pendiente" : status === "PACKING" ? "Empacando" : status === "SHIPPED" ? "Enviado" : status === "DELIVERED" ? "Entregado" : "Cancelado"; }
function nextStatus(status: PickPackShipment["status"]): "PACKING" | "SHIPPED" | null { return status === "PENDING" ? "PACKING" : status === "PACKING" ? "SHIPPED" : null; }
