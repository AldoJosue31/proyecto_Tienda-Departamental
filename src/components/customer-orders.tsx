"use client";

import {
  IconAlertTriangle,
  IconArrowRight,
  IconBox,
  IconCalendar,
  IconChevronDown,
  IconClockHour4,
  IconPackage,
  IconRefresh,
  IconShoppingBag,
  IconTruckDelivery,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { customerOrdersResponseSchema, type CustomerOrder, type CustomerOrderStatus } from "@/lib/orders/customer-orders";
import { customerShipmentsResponseSchema, type CustomerShipment, type CustomerShipmentStatus } from "@/lib/logistics/customer-shipments";

type CustomerOrdersProps = {
  initialOrders: CustomerOrder[] | null;
  initialError: string | null;
  initialShipments: CustomerShipment[] | null;
  initialShipmentsError: string | null;
};

async function fetchCustomerOrders(): Promise<CustomerOrder[]> {
  const response = await fetch("/api/orders/mine", {
    headers: { "X-Correlation-Id": crypto.randomUUID() },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
      ? body.message
      : "No fue posible actualizar tus pedidos.";
    throw new Error(message);
  }
  const parsed = customerOrdersResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("El historial de pedidos no tiene un formato válido.");
  }
  return parsed.data.orders;
}

async function fetchCustomerShipments(): Promise<CustomerShipment[]> {
  const response = await fetch("/api/orders/shipments", {
    headers: { "X-Correlation-Id": crypto.randomUUID() },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
      ? body.message
      : "No fue posible actualizar el avance de tus entregas.";
    throw new Error(message);
  }
  const parsed = customerShipmentsResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("El seguimiento de entregas no tiene un formato válido.");
  }
  return parsed.data.shipments;
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function reference(orderId: string) {
  return `PEDIDO-${orderId.slice(0, 8).toUpperCase()}`;
}

function statusPresentation(status: CustomerOrderStatus) {
  if (status === "CONFIRMED") return { label: "Confirmado", className: "bg-[var(--success-surface)] text-[var(--success)]" };
  if (status === "CANCELLED") return { label: "Cancelado", className: "bg-[var(--danger-surface)] text-[var(--danger)]" };
  if (status === "RESERVED") return { label: "Reservado", className: "bg-[var(--accent-soft)] text-[var(--accent-strong)]" };
  return { label: "En validación", className: "bg-[var(--warning-surface)] text-[var(--warning)]" };
}

function itemSummary(order: CustomerOrder) {
  const names = order.items.slice(0, 2).map((item) => item.productName);
  const remaining = order.items.length - names.length;
  if (!names.length) return "Pedido sin artículos disponibles";
  return `${names.join(" · ")}${remaining > 0 ? ` y ${remaining} más` : ""}`;
}

export function CustomerOrders({ initialOrders, initialError, initialShipments, initialShipmentsError }: CustomerOrdersProps) {
  const ordersQuery = useQuery({
    queryKey: ["customer", "orders"],
    queryFn: fetchCustomerOrders,
    initialData: initialOrders ?? undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const shipmentsQuery = useQuery({
    queryKey: ["customer", "shipments"],
    queryFn: fetchCustomerShipments,
    initialData: initialShipments ?? undefined,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const orders = ordersQuery.data ?? initialOrders ?? [];
  const shipments = shipmentsQuery.data ?? initialShipments ?? [];
  const shipmentsByOrder = new Map(shipments.map((shipment) => [shipment.orderId, shipment]));
  const isLoading = !ordersQuery.data && ordersQuery.isLoading;
  const errorMessage = ordersQuery.error instanceof Error ? ordersQuery.error.message : initialError;
  const shipmentErrorMessage = shipmentsQuery.error instanceof Error ? shipmentsQuery.error.message : initialShipmentsError;

  const refreshOrders = () => {
    void Promise.all([ordersQuery.refetch(), shipmentsQuery.refetch()]);
  };

  return <section className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12" aria-labelledby="customer-orders-title">
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-2xl"><h1 id="customer-orders-title" className="text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Mis pedidos</h1><p className="mt-3 text-pretty leading-7 text-[var(--muted)]">Revisa tus compras registradas, los artículos confirmados y su estado comercial.</p></div>
      <div className="flex flex-wrap items-center gap-3"><p className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--accent-strong)]">{orders.length} {orders.length === 1 ? "pedido" : "pedidos"}</p><Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]"><IconShoppingBag size={17} aria-hidden="true" />Seguir comprando</Link></div>
    </header>

    {isLoading ? <OrdersSkeleton /> : errorMessage && orders.length === 0 ? <Unavailable message={errorMessage} retry={() => { void ordersQuery.refetch(); }} /> : orders.length === 0 ? <EmptyOrders /> : <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[var(--muted)]" aria-live="polite">{ordersQuery.isFetching || shipmentsQuery.isFetching ? "Actualizando pedidos…" : `Mostrando ${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"} registrados`}</p><button type="button" onClick={refreshOrders} disabled={ordersQuery.isFetching || shipmentsQuery.isFetching} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-45"><IconRefresh size={17} className={ordersQuery.isFetching || shipmentsQuery.isFetching ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" />Actualizar</button></div>
      {errorMessage ? <div className="mt-4 flex flex-wrap items-start gap-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-surface)] px-4 py-3" role="alert"><IconAlertTriangle className="mt-0.5 shrink-0 text-[var(--danger)]" size={18} aria-hidden="true" /><p className="flex-1 text-sm leading-6">{errorMessage}</p><button type="button" onClick={refreshOrders} className="min-h-10 rounded-lg px-2 text-sm font-semibold text-[var(--danger)] underline underline-offset-4">Reintentar</button></div> : null}
      {shipmentErrorMessage ? <div className="mt-4 flex flex-wrap items-start gap-3 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-surface)] px-4 py-3" role="status"><IconClockHour4 className="mt-0.5 shrink-0 text-[var(--warning)]" size={18} aria-hidden="true" /><p className="flex-1 text-sm leading-6">{shipmentErrorMessage} Tus pedidos siguen disponibles.</p><button type="button" onClick={() => { void shipmentsQuery.refetch(); }} className="min-h-10 rounded-lg px-2 text-sm font-semibold text-[var(--warning)] underline underline-offset-4">Reintentar</button></div> : null}
      <ol className="mt-5 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] divide-y divide-[var(--line)]">{orders.map((order, index) => <li key={order.id}><OrderRecord order={order} shipment={shipmentsByOrder.get(order.id)} latest={index === 0} /></li>)}</ol>
    </>}
  </section>;
}

function OrderRecord({ order, shipment, latest }: { order: CustomerOrder; shipment: CustomerShipment | undefined; latest: boolean }) {
  const status = statusPresentation(order.status);
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const channel = order.channel === "ONLINE" ? "Compra en línea" : "Compra en sucursal";

  return <article className={`px-5 py-5 sm:px-6 ${latest ? "bg-[var(--surface-muted)]/45" : ""}`}>
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs font-semibold text-[var(--accent-strong)]">{reference(order.id)}</p>{latest ? <span className="rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--accent-strong)]">Más reciente</span> : null}</div><h2 className="mt-2 text-lg font-semibold tracking-[-0.025em]">{channel}</h2><p className="mt-1 max-w-2xl truncate text-sm text-[var(--muted)]" title={itemSummary(order)}>{itemSummary(order)}</p></div><span className={`inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${status.className}`}>{status.label}</span></div>
    <div className="mt-5 grid gap-3 border-y border-[var(--line)] py-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto]"><p className="flex items-center gap-2 text-[var(--muted)]"><IconCalendar size={17} aria-hidden="true" />{dateTime(order.createdAt)}</p><p className="text-[var(--muted)]">{totalItems} {totalItems === 1 ? "artículo" : "artículos"}</p><p className="font-semibold sm:text-right">{money(order.total, order.currency)}</p></div>
    <details className="group mt-4"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)] [&::-webkit-details-marker]:hidden"><IconBox size={17} aria-hidden="true" />Ver artículos y variantes<IconChevronDown size={17} className="ml-auto transition-transform group-open:rotate-180" aria-hidden="true" /></summary><ul className="mt-3 divide-y divide-[var(--line)] border-t border-[var(--line)]">{order.items.map((item) => <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{item.productName}</p><p className="mt-1 text-xs text-[var(--muted)]">{item.variantLabel} · SKU {item.sku} · {item.quantity} {item.quantity === 1 ? "unidad" : "unidades"}</p></div><p className="text-sm font-semibold">{money(item.lineTotal, item.currency)}</p></li>)}</ul></details>
    {order.channel === "ONLINE" && (shipment || order.status === "CONFIRMED") ? <FulfillmentProgress shipment={shipment} /> : null}
    {order.status === "CANCELLED" && order.cancellationReason ? <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Motivo de cancelación: {order.cancellationReason}</p> : null}
  </article>;
}

function FulfillmentProgress({ shipment }: { shipment: CustomerShipment | undefined }) {
  if (!shipment) return <section className="mt-5 border-t border-[var(--line)] pt-4" aria-label="Estado de entrega"><div className="flex items-start gap-3"><IconClockHour4 className="mt-0.5 shrink-0 text-[var(--accent-strong)]" size={18} aria-hidden="true" /><p className="text-sm leading-6 text-[var(--muted)]">Tu compra fue confirmada. El avance de entrega aparecerá aquí cuando el equipo la registre.</p></div></section>;

  const presentation = shipmentPresentation(shipment.status);
  const stages = ["PENDING", "PACKING", "SHIPPED", "DELIVERED"] as const;
  const activeIndex = shipment.status === "CANCELLED" ? -1 : stages.indexOf(shipment.status as (typeof stages)[number]);

  return <section className="mt-5 border-t border-[var(--line)] pt-4" aria-labelledby={`shipment-${shipment.id}-title`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${presentation.iconClassName}`}><IconTruckDelivery size={18} aria-hidden="true" /></span><div><h3 id={`shipment-${shipment.id}-title`} className="text-sm font-semibold">{presentation.label}</h3><p className="mt-1 text-sm leading-6 text-[var(--muted)]">{presentation.description}</p></div></div><time className="text-xs text-[var(--muted)]" dateTime={shipment.updatedAt}>Actualizado {dateTime(shipment.updatedAt)}</time></div>
    {activeIndex >= 0 ? <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label={`Progreso de entrega: ${presentation.label}`}>{stages.map((stage, index) => <li key={stage} className="min-w-0"><span className={`block h-1.5 rounded-full ${index <= activeIndex ? "bg-[var(--accent)]" : "bg-[var(--surface-muted)]"}`} aria-hidden="true" /><span className={`mt-2 block text-xs leading-5 ${index <= activeIndex ? "font-semibold text-[var(--ink)]" : "text-[var(--muted)]"}`}>{shipmentStageLabel(stage)}</span></li>)}</ol> : null}
  </section>;
}

function shipmentPresentation(status: CustomerShipmentStatus) {
  if (status === "PENDING") return { label: "Preparación pendiente", description: "Tu pedido está confirmado y espera preparación.", iconClassName: "bg-[var(--accent-soft)] text-[var(--accent-strong)]" };
  if (status === "PACKING") return { label: "En preparación", description: "El equipo está preparando tu pedido para envío.", iconClassName: "bg-[var(--accent-soft)] text-[var(--accent-strong)]" };
  if (status === "SHIPPED") return { label: "Enviado", description: "Tu pedido ya salió de preparación. Actualizaremos este estado al confirmarse la entrega.", iconClassName: "bg-[var(--success-surface)] text-[var(--success)]" };
  if (status === "DELIVERED") return { label: "Entregado", description: "La entrega fue confirmada por el equipo de operación.", iconClassName: "bg-[var(--success-surface)] text-[var(--success)]" };
  return { label: "Envío cancelado", description: "El envío fue cancelado y no continuará en preparación.", iconClassName: "bg-[var(--danger-surface)] text-[var(--danger)]" };
}

function shipmentStageLabel(status: Exclude<CustomerShipmentStatus, "CANCELLED">) {
  return status === "PENDING" ? "Confirmado" : status === "PACKING" ? "Preparación" : status === "SHIPPED" ? "Enviado" : "Entregado";
}

function EmptyOrders() {
  return <section className="mt-8 grid min-h-72 place-items-center rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-12 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-strong)]"><IconPackage size={24} aria-hidden="true" /></span><h2 className="mt-5 text-xl font-semibold tracking-[-0.025em]">Aún no tienes pedidos</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">Cuando confirmes una compra, aparecerá aquí con sus artículos y estado.</p><Link href="/" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]"><IconArrowRight size={17} aria-hidden="true" />Explorar catálogo</Link></div></section>;
}

function Unavailable({ message, retry }: { message: string; retry: () => void }) {
  return <section className="mt-8 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-surface)] px-6 py-8" role="alert"><IconAlertTriangle className="text-[var(--danger)]" size={24} aria-hidden="true" /><h2 className="mt-5 text-xl font-semibold tracking-[-0.025em]">No pudimos cargar tus pedidos</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">{message}</p><button type="button" onClick={retry} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--danger)] transition-colors hover:bg-white"><IconRefresh size={17} aria-hidden="true" />Reintentar</button></section>;
}

function OrdersSkeleton() {
  return <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]" aria-label="Cargando pedidos" aria-busy="true"><div className="h-52 bg-[var(--surface-muted)] animate-pulse motion-reduce:animate-none" /><div className="h-44 border-t border-[var(--line)] bg-[var(--surface)] animate-pulse motion-reduce:animate-none" /></div>;
}
