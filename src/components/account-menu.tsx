"use client";

import { IconChevronDown, IconLogout, IconUserCircle } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { signOut } from "@/app/login/actions";
import { roleLabel, type SessionUser } from "@/lib/auth/roles";

function SignOutActions({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();

  return <div className="mt-6 flex flex-wrap justify-end gap-3">
    <button type="button" autoFocus disabled={pending} onClick={onCancel} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--line)] px-4 text-sm font-semibold transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-wait disabled:opacity-60">Cancelar</button>
    <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-60">{pending ? "Cerrando sesión…" : "Cerrar sesión"}</button>
  </div>;
}

export function AccountMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const onAccountPage = pathname === "/account";

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function openSignOutDialog() {
    setOpen(false);
    dialogRef.current?.showModal();
  }

  return <div ref={rootRef} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} className="relative min-w-0 shrink-0">
    <button ref={triggerRef} type="button" aria-label={`Menú de cuenta de ${user.name}, ${roleLabel[user.role]}`} aria-expanded={open} aria-controls={open ? "account-options" : undefined} onClick={() => setOpen((current) => !current)} className={`inline-flex min-h-11 max-w-[8.5rem] items-center gap-1 rounded-xl border px-2.5 text-left transition-colors sm:max-w-[16rem] sm:gap-2 sm:px-3 ${open || onAccountPage ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "border-[var(--line)] text-[var(--ink)] hover:bg-[var(--surface-muted)]"}`}>
      <span className="hidden size-8 shrink-0 place-items-center rounded-lg bg-[var(--surface)] text-[var(--accent-strong)] sm:grid"><IconUserCircle size={20} stroke={1.75} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><span className="hidden truncate text-sm font-semibold sm:block" title={user.name}>{user.name}</span><span className="block truncate text-xs font-medium sm:text-[11px]" title={roleLabel[user.role]}>{roleLabel[user.role]}</span></span>
      <IconChevronDown size={16} aria-hidden="true" className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
    </button>

    {open && <div id="account-options" className="absolute right-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-lg">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <p className="truncate text-sm font-semibold" title={user.name}>{user.name}</p>
        <p className="mt-0.5 truncate text-xs text-[var(--muted)]" title={user.email}>{user.email}</p>
      </div>
      <nav aria-label="Opciones de cuenta" className="p-1.5">
        <Link href="/account" aria-current={onAccountPage ? "page" : undefined} onClick={() => setOpen(false)} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${onAccountPage ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "text-[var(--ink)] hover:bg-[var(--surface-muted)]"}`}><IconUserCircle size={19} stroke={1.75} aria-hidden="true" />Mi cuenta</Link>
        <div className="my-1 border-t border-[var(--line)]" />
        <button type="button" onClick={openSignOutDialog} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"><IconLogout size={19} stroke={1.75} aria-hidden="true" />Cerrar sesión</button>
      </nav>
    </div>}

    <dialog ref={dialogRef} onClose={() => triggerRef.current?.focus()} aria-labelledby="sign-out-title" aria-describedby="sign-out-description" className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-0 text-[var(--ink)] shadow-xl backdrop:bg-black/50">
      <div className="p-6">
        <h2 id="sign-out-title" className="text-xl font-semibold tracking-[-0.03em]">¿Cerrar sesión?</h2>
        <p id="sign-out-description" className="mt-2 text-sm leading-6 text-[var(--muted)]">¿Estás seguro de que quieres cerrar tu sesión?</p>
        <form action={signOut}><SignOutActions onCancel={() => dialogRef.current?.close()} /></form>
      </div>
    </dialog>
  </div>;
}
