"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { IconCalendarClock, IconEdit, IconPlus, IconRefresh } from "@tabler/icons-react";
import type { CatalogPage } from "@/lib/catalog/types";
import { promotionInputSchema, type Promotion, type PromotionInput } from "@/lib/pricing/promotions-schema";
import { utcToZonedDateTime, zonedDateTimeToUtc } from "@/lib/pricing/zoned-date-time";

const inputClass = "mt-1.5 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm";
const statusLabels = { DRAFT: "Borrador", SCHEDULED: "Programada", ACTIVE: "Activa", EXPIRED: "Vencida" };

async function readPromotions(): Promise<{ promotions: Promotion[] }> {
  const response = await fetch("/api/promotions", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "No fue posible consultar promociones.");
  return body;
}

export function PromotionsWorkspace({ initial }: { initial: { promotions: Promotion[] } | null }) {
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["promotions"], queryFn: readPromotions, initialData: initial ?? undefined, refetchInterval: 30000 });
  const save = useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: PromotionInput }) => {
      const response = await fetch(id ? `/api/promotions/${encodeURIComponent(id)}` : "/api/promotions", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "No fue posible guardar la promoción.");
      return body as { promotion: Promotion };
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["promotions"] }); setEditing(null); setEditorVersion((value) => value + 1); },
  });
  return <section className="platform-page" aria-labelledby="promotions-title">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]"><IconCalendarClock size={18} aria-hidden="true" />Precios y campañas</p><h1 id="promotions-title" className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Promociones programadas</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">Define descuentos y sus horarios. Cada campaña se activa y termina automáticamente en su zona horaria.</p></div><button type="button" onClick={() => { save.reset(); setEditing(null); setEditorVersion((value) => value + 1); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white"><IconPlus size={17} aria-hidden="true" />Nueva promoción</button></div>
    <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_1.1fr]">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6" aria-busy={list.isFetching}>
        <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Campañas</h2><button type="button" aria-label="Actualizar promociones" disabled={list.isFetching} onClick={() => void list.refetch()} className="grid size-11 place-items-center rounded-xl hover:bg-[var(--surface-muted)] disabled:opacity-50"><IconRefresh size={18} aria-hidden="true" /></button></div>
        {list.isLoading ? <p role="status" className="mt-5 text-sm">Cargando promociones…</p> : list.error ? <p role="alert" className="mt-5 text-sm text-[var(--danger)]">{list.error.message}</p> : list.data?.promotions.length ? <ul className="mt-4 divide-y divide-[var(--line)]">{list.data.promotions.map((promotion) => <li key={promotion.id} className="py-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{promotion.name}</h3><p className="mt-1 text-sm text-[var(--muted)]">{promotion.discountType === "PERCENTAGE" ? `${promotion.discountValue}%` : `${promotion.discountValue} de descuento fijo`} · {statusLabels[promotion.status]}</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">{utcToZonedDateTime(promotion.startsAt, promotion.timezone).replace("T", " ")} → {utcToZonedDateTime(promotion.endsAt, promotion.timezone).replace("T", " ")}<br />{promotion.timezone} · Prioridad {promotion.priority}</p></div><button type="button" disabled={promotion.status === "EXPIRED" || save.isPending} onClick={() => { save.reset(); setEditing(promotion); }} aria-label={`Editar ${promotion.name}`} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[var(--accent-soft)] disabled:opacity-40"><IconEdit size={18} aria-hidden="true" /></button></div></li>)}</ul> : <p className="mt-6 text-sm leading-6 text-[var(--muted)]">Aún no hay campañas. Programa la primera con el formulario.</p>}
      </div>
      <PromotionEditor key={`${editing?.id ?? "new"}-${editorVersion}`} promotion={editing} pending={save.isPending} error={save.error?.message ?? null} success={save.isSuccess} onSave={(input) => save.mutate({ id: editing?.id, input })} />
    </div>
  </section>;
}

function PromotionEditor({ promotion, pending, error, success, onSave }: { promotion: Promotion | null; pending: boolean; error: string | null; success: boolean; onSave: (input: PromotionInput) => void }) {
  const [timezone, setTimezone] = useState(promotion?.timezone ?? "America/Mexico_City");
  const [scope, setScope] = useState<PromotionInput["targets"][number]["scope"] | "KEEP">(promotion ? "KEEP" : "ALL");
  const [search, setSearch] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const catalog = useQuery({ queryKey: ["promotion-catalog", search], enabled: scope !== "ALL" && scope !== "KEEP", queryFn: async () => {
    const response = await fetch(`/api/catalog?${new URLSearchParams({ search, pageSize: "100" })}`);
    if (!response.ok) throw new Error("No fue posible consultar el catálogo.");
    return response.json() as Promise<CatalogPage>;
  } });
  const products = catalog.data?.items ?? [];
  const targets = scope === "PRODUCT" ? products.map((product) => ({ id: product.id, label: product.name }))
    : scope === "CATEGORY" ? [...new Map(products.map((product) => [product.category.id, { id: product.category.id, label: product.category.name }])).values()]
      : products.flatMap((product) => product.variants.map((variant) => ({ id: variant.id, label: `${product.name} · ${variant.label}` })));
  const currentTarget = promotion?.targets.find((target) => target.scope === scope)?.targetId;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFormError(null);
    const form = new FormData(event.currentTarget);
    try {
      const parsed = promotionInputSchema.safeParse({ name: form.get("name"), discountType: form.get("discountType"), discountValue: Number(form.get("discountValue")), priority: Number(form.get("priority")), timezone,
        startsAt: zonedDateTimeToUtc(String(form.get("startsAt")), timezone), endsAt: zonedDateTimeToUtc(String(form.get("endsAt")), timezone),
        targets: scope === "KEEP" ? promotion?.targets.map((target) => ({ scope: target.scope, ...(target.targetId ? { targetId: target.targetId } : {}) })) : scope === "ALL" ? [{ scope }] : [{ scope, targetId: form.get("targetId") }],
      });
      if (!parsed.success) { setFormError(parsed.error.issues[0]?.message ?? "Revisa la promoción."); return; }
      onSave(parsed.data);
    } catch (failure) { setFormError(failure instanceof Error ? failure.message : "Revisa las fechas."); }
  };
  return <form onSubmit={submit} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6" aria-busy={pending}>
    <h2 className="font-semibold">{promotion ? "Editar promoción" : "Crear promoción"}</h2>
    <fieldset disabled={pending} className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2 text-sm font-semibold">Nombre<input name="name" required minLength={3} maxLength={160} defaultValue={promotion?.name ?? ""} placeholder="Venta Nocturna" className={inputClass} /></label>
      <label className="text-sm font-semibold">Tipo de descuento<select name="discountType" defaultValue={promotion?.discountType ?? "PERCENTAGE"} className={inputClass}><option value="PERCENTAGE">Porcentaje</option><option value="FIXED">Importe fijo</option></select></label>
      <label className="text-sm font-semibold">Valor<input name="discountValue" type="number" required min="0.01" max="9999999.99" step="0.01" defaultValue={promotion?.discountValue ?? ""} className={inputClass} /></label>
      <label className="text-sm font-semibold">Inicio<input name="startsAt" type="datetime-local" required defaultValue={promotion ? utcToZonedDateTime(promotion.startsAt, promotion.timezone) : ""} className={inputClass} /></label>
      <label className="text-sm font-semibold">Fin<input name="endsAt" type="datetime-local" required defaultValue={promotion ? utcToZonedDateTime(promotion.endsAt, promotion.timezone) : ""} className={inputClass} /></label>
      <label className="text-sm font-semibold">Zona horaria<input value={timezone} onChange={(event) => setTimezone(event.target.value)} required list="promotion-timezones" className={inputClass} /><datalist id="promotion-timezones"><option value="America/Mexico_City" /><option value="UTC" /><option value="America/New_York" /></datalist></label>
      <label className="text-sm font-semibold">Prioridad<input name="priority" type="number" required min="0" max="1000" defaultValue={promotion?.priority ?? 0} className={inputClass} /></label>
      <label className="sm:col-span-2 text-sm font-semibold">Aplicar a<select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} className={inputClass}>{promotion ? <option value="KEEP">Conservar alcance actual ({promotion.targets.length} destinos)</option> : null}<option value="ALL">Todo el catálogo</option><option value="CATEGORY">Una categoría</option><option value="PRODUCT">Un producto</option><option value="VARIANT">Una variante</option></select></label>
      {scope !== "ALL" && scope !== "KEEP" ? <><label className="sm:col-span-2 text-sm font-semibold">Buscar en catálogo<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className={inputClass} /></label><label className="sm:col-span-2 text-sm font-semibold">Selección<select key={scope} name="targetId" required defaultValue={currentTarget ?? ""} className={inputClass}><option value="">Selecciona una opción</option>{currentTarget && !targets.some((target) => target.id === currentTarget) ? <option value={currentTarget}>Selección actual</option> : null}{targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select></label>{catalog.error ? <p role="alert" className="sm:col-span-2 text-sm text-[var(--danger)]">{catalog.error.message}</p> : null}</> : null}
    </fieldset>
    <p className="mt-4 text-xs leading-5 text-[var(--muted)]">Las horas se interpretan en la zona de esta campaña. El horario de tu dispositivo no cambia su inicio.</p>
    {formError || error ? <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{formError ?? error}</p> : null}
    {success ? <p role="status" className="mt-4 text-sm text-[var(--success)]">Promoción guardada.</p> : null}
    <button type="submit" disabled={pending} className="mt-5 min-h-11 w-full rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Guardando…" : "Guardar promoción"}</button>
  </form>;
}
