"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function CustomerOrderCancellation({ orderId, status, dispatched }: { orderId: string; status: string; dispatched: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  if (status === "CANCELLED" || succeeded) return <p role="status" className="mt-5 text-sm text-[var(--success)]">Pedido cancelado. El inventario y los beneficios se concilian automáticamente.</p>;
  if (dispatched) return <p className="mt-5 text-sm text-[var(--muted)]">Este pedido ya fue enviado y no admite cancelación.</p>;
  async function cancel() {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, { method: "POST", headers: { "Content-Type": "application/json", "X-Correlation-Id": crypto.randomUUID() }, body: JSON.stringify({ reason: reason.trim() || undefined }) });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.order?.status !== "CANCELLED") throw new Error(body?.message ?? "No se pudo confirmar la cancelación. Puedes reintentar.");
      setSucceeded(true);
      dialog.current?.close();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo confirmar la cancelación.");
    } finally {
      setPending(false);
      router.refresh();
    }
  }
  return <div className="mt-5">
    <button type="button" onClick={() => { dialog.current?.showModal(); keepButton.current?.focus(); }} className="min-h-11 rounded-xl border border-[var(--danger)]/40 px-4 text-sm font-semibold text-[var(--danger)]">{status === "CANCELLATION_PENDING" ? "Reintentar cancelación" : "Cancelar pedido"}</button>
    <dialog ref={dialog} aria-labelledby="cancel-order-title" onCancel={event => { if (pending) event.preventDefault(); }} className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--ink)] backdrop:bg-black/40">
      <h2 id="cancel-order-title" className="text-xl font-semibold">Cancelar este pedido</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Validaremos que aún no haya salido de preparación. Si ya fue enviado, conservaremos tu compra.</p>
      <label className="mt-4 block text-sm font-semibold">Motivo (opcional)<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} disabled={pending} rows={3} className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3" /></label>
      {message && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{message}</p>}
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" ref={keepButton} disabled={pending} onClick={() => dialog.current?.close()} className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold">Conservar pedido</button><button type="button" disabled={pending} onClick={() => void cancel()} className="min-h-11 rounded-xl bg-[var(--danger)] px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Validando cancelación…" : "Confirmar cancelación"}</button></div>
    </dialog>
  </div>;
}
