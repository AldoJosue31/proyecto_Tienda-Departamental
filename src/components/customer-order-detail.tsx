import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCalendar,
  IconClockHour4,
  IconReceipt,
  IconTruckDelivery,
} from "@tabler/icons-react";
import Link from "next/link";

import type { CustomerShipment, CustomerShipmentStatus } from "@/lib/logistics/customer-shipments";
import type { CustomerOrder, CustomerOrderStatus } from "@/lib/orders/customer-orders";

type CustomerOrderDetailProps = {
  order: CustomerOrder;
  shipment: CustomerShipment | undefined;
  shipmentError: boolean;
};

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

function orderStatusPresentation(status: CustomerOrderStatus) {
  if (status === "CONFIRMED") return { label: "Confirmado", className: "bg-[var(--success-surface)] text-[var(--success)]" };
  if (status === "CANCELLED") return { label: "Cancelado", className: "bg-[var(--danger-surface)] text-[var(--danger)]" };
  if (status === "RESERVED") return { label: "Reservado", className: "bg-[var(--accent-soft)] text-[var(--accent-strong)]" };
  return { label: "En validación", className: "bg-[var(--warning-surface)] text-[var(--warning)]" };
}

function shipmentPresentation(status: CustomerShipmentStatus) {
  if (status === "PENDING") return { label: "Preparación pendiente", description: "Tu pedido está confirmado y espera preparación.", className: "bg-[var(--accent-soft)] text-[var(--accent-strong)]" };
  if (status === "PACKING") return { label: "En preparación", description: "El equipo está preparando tu pedido para envío.", className: "bg-[var(--accent-soft)] text-[var(--accent-strong)]" };
  if (status === "SHIPPED") return { label: "Enviado", description: "Tu pedido ya salió de preparación. Actualizaremos el estado al confirmarse la entrega.", className: "bg-[var(--success-surface)] text-[var(--success)]" };
  if (status === "DELIVERED") return { label: "Entregado", description: "La entrega fue confirmada por el equipo de operación.", className: "bg-[var(--success-surface)] text-[var(--success)]" };
  return { label: "Envío cancelado", description: "El envío fue cancelado y no continuará en preparación.", className: "bg-[var(--danger-surface)] text-[var(--danger)]" };
}

function shipmentStageLabel(status: Exclude<CustomerShipmentStatus, "CANCELLED">) {
  return status === "PENDING" ? "Confirmado" : status === "PACKING" ? "Preparación" : status === "SHIPPED" ? "Enviado" : "Entregado";
}

export function CustomerOrderDetail({ order, shipment, shipmentError }: CustomerOrderDetailProps) {
  const orderStatus = orderStatusPresentation(order.status);
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const stages = ["PENDING", "PACKING", "SHIPPED", "DELIVERED"] as const;
  const shipmentState = shipment ? shipmentPresentation(shipment.status) : null;
  const activeStage = shipment && shipment.status !== "CANCELLED" ? stages.indexOf(shipment.status) : -1;

  return <section className="mx-auto max-w-[960px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12" aria-labelledby="order-detail-title">
    <Link href="/orders" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]"><IconArrowLeft size={18} aria-hidden="true" />Volver a mis pedidos</Link>
    <header className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-6"><div><h1 id="order-detail-title" className="text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Detalle de pedido</h1><div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm leading-6 text-[var(--muted)]"><p>Referencia <span className="font-mono text-xs font-semibold text-[var(--accent-strong)]">{reference(order.id)}</span></p><p className="flex items-center gap-2"><IconCalendar size={17} aria-hidden="true" />Registrado {dateTime(order.createdAt)}</p></div></div><span className={`inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${orderStatus.className}`}>{orderStatus.label}</span></header>

    <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-6"><section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]" aria-labelledby="order-items-title"><div className="border-b border-[var(--line)] px-5 py-4 sm:px-6"><h2 id="order-items-title" className="font-semibold">Artículos confirmados</h2><p className="mt-1 text-sm text-[var(--muted)]">{totalItems} {totalItems === 1 ? "artículo" : "artículos"} en esta compra.</p></div><ul className="divide-y divide-[var(--line)]">{order.items.map((item) => <li key={item.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 sm:px-6"><div><p className="text-sm font-semibold">{item.productName}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.variantLabel} · SKU {item.sku} · {item.quantity} {item.quantity === 1 ? "unidad" : "unidades"}</p></div><p className="text-sm font-semibold">{money(item.lineTotal, item.currency)}</p></li>)}</ul></section>
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 py-5 sm:px-6" aria-labelledby="order-shipment-title"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-lg ${shipmentState?.className ?? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"}`}><IconTruckDelivery size={19} aria-hidden="true" /></span><div><h2 id="order-shipment-title" className="font-semibold">Entrega</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">{shipmentState?.description ?? (order.status === "CONFIRMED" ? "Tu compra fue confirmada. El avance aparecerá cuando el equipo registre la preparación." : "El avance de entrega estará disponible cuando aplique a este pedido.")}</p></div></div>{shipment ? <time className="text-xs text-[var(--muted)]" dateTime={shipment.updatedAt}>Actualizado {dateTime(shipment.updatedAt)}</time> : null}</div>
          {shipmentError ? <p className="mt-4 flex items-start gap-2 border-t border-[var(--line)] pt-4 text-sm leading-6 text-[var(--warning)]" role="status"><IconClockHour4 className="mt-0.5 shrink-0" size={17} aria-hidden="true" />No pudimos consultar la actualización de entrega. La información comercial de tu pedido sigue disponible.</p> : null}
          {shipment && activeStage >= 0 ? <><p className="mt-5 text-sm font-semibold">{shipmentState?.label}</p><ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label={`Progreso de entrega: ${shipmentState?.label}`}>{stages.map((stage, index) => <li key={stage} className="min-w-0"><span className={`block h-1.5 rounded-full ${index <= activeStage ? "bg-[var(--accent)]" : "bg-[var(--surface-muted)]"}`} aria-hidden="true" /><span className={`mt-2 block text-xs leading-5 ${index <= activeStage ? "font-semibold text-[var(--ink)]" : "text-[var(--muted)]"}`}>{shipmentStageLabel(stage)}</span></li>)}</ol></> : null}
        </section></div>
      <aside className="h-fit rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 lg:sticky lg:top-28 sm:p-6" aria-labelledby="order-summary-title"><div className="flex items-center gap-2"><IconReceipt size={18} className="text-[var(--accent-strong)]" aria-hidden="true" /><h2 id="order-summary-title" className="font-semibold">Resumen</h2></div><dl className="mt-5 space-y-3 border-y border-[var(--line)] py-4 text-sm"><div className="flex items-center justify-between gap-4 text-[var(--muted)]"><dt>Canal</dt><dd>{order.channel === "ONLINE" ? "Compra en línea" : "Compra en sucursal"}</dd></div><div className="flex items-center justify-between gap-4 text-[var(--muted)]"><dt>Subtotal</dt><dd>{money(order.subtotal, order.currency)}</dd></div>{order.discountTotal > 0 ? <div className="flex items-center justify-between gap-4 text-[var(--success)]"><dt>Descuento</dt><dd>-{money(order.discountTotal, order.currency)}</dd></div> : null}<div className="flex items-end justify-between gap-4"><dt className="font-semibold">Total</dt><dd className="text-xl font-semibold tracking-[-0.03em]">{money(order.total, order.currency)}</dd></div></dl>{order.status === "CANCELLED" && order.cancellationReason ? <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-[var(--muted)]"><IconAlertTriangle className="mt-0.5 shrink-0 text-[var(--danger)]" size={17} aria-hidden="true" />Motivo de cancelación: {order.cancellationReason}</p> : null}<p className="mt-4 text-xs leading-5 text-[var(--muted)]">Por tu privacidad, este detalle no muestra datos personales de reparto.</p></aside>
    </div>
  </section>;
}

export function CustomerOrderDetailUnavailable() {
  return <section className="mx-auto max-w-[760px] px-4 py-12 sm:px-6"><Link href="/orders" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]"><IconArrowLeft size={18} aria-hidden="true" />Volver a mis pedidos</Link><div className="mt-6 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-surface)] px-6 py-8" role="alert"><IconAlertTriangle className="text-[var(--danger)]" size={24} aria-hidden="true" /><h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">No pudimos cargar este pedido</h1><p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">Intenta volver a Mis pedidos. Si el problema continúa, actualiza la página más tarde.</p></div></section>;
}
