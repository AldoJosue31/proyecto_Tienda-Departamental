"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { AccountRequestError, accountRequest } from "@/lib/auth/onboarding-client";
import { inviteSchema } from "@/lib/auth/onboarding-schemas";
import { deliveryLabel, employeePageSchema, fieldErrors, type Employee, type EmployeePage } from "@/lib/auth/onboarding-ui";
import { AccountField, FormMessage, primaryButton, secondaryButton } from "./auth/account-form-parts";

export function EmployeesWorkspace({ initialData }: { initialData: EmployeePage | null }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1), [search, setSearch] = useState("");
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Employee | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), inFlight = useRef(false), invitation = useRef<{ signature: string; key: string } | null>(null);
  const query = useQuery({ queryKey: ["employees", page, search], queryFn: async () => employeePageSchema.parse(await accountRequest(`/api/auth/employees?page=${page}&pageSize=20&search=${encodeURIComponent(search)}`)), initialData: page === 1 && !search && initialData ? initialData : undefined, refetchInterval: 10000 });
  async function reload() { await queryClient.invalidateQueries({ queryKey: ["employees"] }); }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current) return;
    const form = event.currentTarget, values = new FormData(form), parsed = inviteSchema.safeParse({ name: values.get("name"), email: values.get("email") });
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); (form.elements.namedItem(String(parsed.error.issues[0]?.path[0])) as HTMLElement | null)?.focus(); return; }
    const signature = JSON.stringify(parsed.data);
    if (invitation.current?.signature !== signature) invitation.current = { signature, key: crypto.randomUUID() };
    inFlight.current = true; setPending(true); setError(""); setNotice(""); setErrors({});
    try {
      await accountRequest("/api/auth/employees/invitations", "POST", parsed.data, { "Idempotency-Key": invitation.current.key });
      invitation.current = null; form.reset(); setNotice("Invitación registrada. El empleado elegirá su contraseña desde el correo; puedes revisar el estado del envío en la lista."); await reload();
    } catch (failure) { setError((failure as Error).message); }
    finally { inFlight.current = false; setPending(false); }
  }
  async function change(employee: Employee, action: "status" | "resend") {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError(""); setNotice("");
    try {
      if (action === "status") {
        await accountRequest(`/api/auth/employees/${employee.id}/status`, "PATCH", { isActive: !employee.isActive, authVersion: employee.authVersion });
        setNotice(employee.isActive ? "Empleado desactivado. Sus sesiones quedarán bloqueadas en un máximo de 35 segundos." : "Empleado habilitado. Debe iniciar sesión de nuevo; si su alta está pendiente, reenvía una invitación nueva.");
      } else {
        await accountRequest(`/api/auth/employees/${employee.id}/invitation/resend`, "POST", {});
        setNotice("Se solicitó una invitación nueva. El enlace anterior dejó de ser válido.");
      }
      dialog.current?.close(); setSelected(null); await reload();
    } catch (failure) {
      setError((failure as Error).message);
      if (failure instanceof AccountRequestError && failure.code === "AUTH_VERSION_CONFLICT") { dialog.current?.close(); setSelected(null); await reload(); }
    } finally { inFlight.current = false; setPending(false); }
  }
  const data = query.data, pages = data ? Math.max(1, Math.ceil(data.pagination.total / data.pagination.pageSize)) : 1;
  return <section className="platform-page">
    <h1 className="text-3xl font-semibold tracking-[-0.035em]">Usuarios</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">Invita empleados y administra su acceso. Cada persona elige su contraseña; la cuenta se activa cuando acepta la invitación.</p>
    <section aria-labelledby="invite-title" className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><h2 id="invite-title" className="text-lg font-semibold">Invitar empleado</h2><form onSubmit={invite} noValidate className="mt-4"><fieldset disabled={pending} className="grid items-start gap-4 sm:grid-cols-2"><AccountField name="name" label="Nombre completo" required maxLength={120} autoComplete="off" error={errors.name} /><AccountField name="email" label="Correo del empleado" required type="email" maxLength={320} autoComplete="off" error={errors.email} /></fieldset><button className={primaryButton + " mt-5"} disabled={pending}>{pending ? "Procesando…" : "Enviar invitación"}</button></form></section>
    <div aria-live="polite" className="mt-5 space-y-3">{notice && <FormMessage>{notice}</FormMessage>}{error && <FormMessage error>{error}</FormMessage>}</div>
    <section aria-labelledby="employees-title" className="mt-9">
      <div className="flex flex-wrap items-center justify-between gap-4"><h2 id="employees-title" className="text-xl font-semibold">Empleados</h2><button type="button" onClick={() => void query.refetch()} className={secondaryButton} disabled={query.isFetching}>{query.isFetching ? "Actualizando…" : "Actualizar lista"}</button></div>
      <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(String(new FormData(event.currentTarget).get("search") || "").trim()); }}><div className="min-w-0 flex-1"><AccountField name="search" label="Buscar por nombre o correo" type="search" maxLength={120} /></div><button className={secondaryButton}>Buscar</button></form>
      {query.isPending && <div role="status" className="mt-5 rounded-xl bg-[var(--surface-muted)] p-6 text-sm">Cargando empleados…</div>}
      {query.isError && <div className="mt-5 space-y-3"><FormMessage error>{query.error instanceof AccountRequestError ? query.error.message : "No pudimos cargar empleados. Usa Actualizar lista para reintentar."}</FormMessage>{query.error instanceof AccountRequestError && query.error.status === 401 && <Link href="/login?next=%2Fusers" className={secondaryButton}>Iniciar sesión</Link>}</div>}
      {data && <><p role="status" className="mt-5 text-sm text-[var(--muted)]">{data.pagination.total} empleados{search ? " encontrados" : " registrados"}. Página {page} de {pages}.</p>{!data.employees.length ? <p className="mt-5 rounded-xl bg-[var(--surface-muted)] p-6 text-sm leading-6">{search ? "No hay empleados que coincidan con esta búsqueda. Prueba otro nombre o correo." : "Todavía no hay empleados. Envía la primera invitación con el formulario de arriba."}</p> : <ul className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">{data.employees.map(employee => <li key={employee.id} className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_auto] lg:items-center"><div className="min-w-0"><h3 className="break-words font-semibold">{employee.name}</h3><p className="mt-1 break-all text-sm text-[var(--muted)]">{employee.email}</p></div><dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-[var(--muted)]">Alta</dt><dd className="mt-1 font-medium">{employee.onboardingStatus === "READY" ? "Cuenta lista" : "Invitación pendiente"}</dd></div><div><dt className="text-xs text-[var(--muted)]">Acceso</dt><dd className="mt-1 font-medium">{employee.isActive ? "Habilitado" : "Desactivado"}</dd></div><div><dt className="text-xs text-[var(--muted)]">Correo</dt><dd className="mt-1 font-medium">{employee.deliveryStatus ? deliveryLabel[employee.deliveryStatus] : "Sin envío"}</dd>{employee.deliveryAttempt !== null && <dd className="mt-1 text-xs text-[var(--muted)]">Intentos: {employee.deliveryAttempt}</dd>}</div></dl><div className="flex flex-wrap gap-2">{employee.onboardingStatus === "PENDING_INVITATION" && <button type="button" className={secondaryButton} disabled={pending || !employee.isActive} onClick={() => void change(employee, "resend")}>Reenviar invitación</button>}<button type="button" className={secondaryButton} disabled={pending} onClick={() => { setError(""); setSelected(employee); dialog.current?.showModal(); }}>{employee.isActive ? "Desactivar" : "Habilitar"}<span className="sr-only"> a {employee.name}</span></button></div></li>)}</ul>}<nav aria-label="Paginación de empleados" className="mt-5 flex flex-wrap items-center justify-between gap-3"><button className={secondaryButton} disabled={page <= 1 || query.isFetching} onClick={() => setPage(current => current - 1)}>Anterior</button><button className={secondaryButton} disabled={page >= pages || query.isFetching} onClick={() => setPage(current => current + 1)}>Siguiente</button></nav></>}
    </section>
    <dialog ref={dialog} onCancel={event => { if (pending) event.preventDefault(); else setSelected(null); }} onClose={() => setSelected(null)} aria-labelledby="status-title" aria-describedby="status-description" className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl bg-[var(--surface)] p-6 text-[var(--ink)] backdrop:bg-black/40">
      <h2 id="status-title" className="text-xl font-semibold">{selected?.isActive ? "Desactivar empleado" : "Habilitar empleado"}</h2><p className="mt-3 break-words font-medium">{selected?.name}</p><p id="status-description" className="mt-3 text-sm leading-6 text-[var(--muted)]">{selected?.isActive ? "Se cerrará su acceso en un máximo de 35 segundos y sus invitaciones pendientes dejarán de servir. Habilitarlo después no recupera las sesiones ni los enlaces anteriores." : "Necesitará iniciar sesión de nuevo. Si su invitación estaba pendiente, debes reenviarla después de habilitarlo."}</p>{error && <div className="mt-4"><FormMessage error>{error}</FormMessage></div>}<div className="mt-6 flex flex-wrap justify-end gap-3"><button className={secondaryButton} autoFocus disabled={pending} onClick={() => dialog.current?.close()}>Cancelar</button><button className={primaryButton} disabled={pending || !selected} onClick={() => selected && void change(selected, "status")}>{pending ? "Guardando…" : selected?.isActive ? "Confirmar desactivación" : "Confirmar habilitación"}</button></div>
    </dialog>
  </section>;
}
