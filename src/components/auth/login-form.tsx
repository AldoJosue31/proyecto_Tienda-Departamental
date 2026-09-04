"use client";

import { IconArrowRight, IconLock, IconMail } from "@tabler/icons-react";
import { useActionState } from "react";

import { signIn } from "@/app/login/actions";
import { initialLoginState } from "@/app/login/login-state";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, isPending] = useActionState(signIn, initialLoginState);

  return (
    <form action={formAction} className="mt-8 space-y-5" noValidate>
      <input type="hidden" name="next" value={nextPath} />
      {state.message && <p role="alert" className="rounded-xl border border-[var(--danger)]/35 bg-[var(--danger-surface)] px-3.5 py-3 text-sm leading-6 text-[var(--ink)]">{state.message}</p>}
      <label className="block">
        <span className="text-sm font-semibold">Correo institucional o de cliente</span>
        <span className="relative mt-2 block">
          <IconMail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} aria-hidden="true" />
          <input name="email" type="email" autoComplete="email" inputMode="email" aria-invalid={Boolean(state.fieldErrors?.email)} aria-describedby={state.fieldErrors?.email ? "email-error" : undefined} placeholder="nombre@correo.com" className="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] pl-10 pr-3 text-sm placeholder:text-[var(--muted)]" required />
        </span>
        {state.fieldErrors?.email?.[0] && <span id="email-error" className="mt-2 block text-sm text-[var(--danger)]">{state.fieldErrors.email[0]}</span>}
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Contraseña</span>
        <span className="relative mt-2 block">
          <IconLock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} aria-hidden="true" />
          <input name="password" type="password" autoComplete="current-password" aria-invalid={Boolean(state.fieldErrors?.password)} aria-describedby={state.fieldErrors?.password ? "password-error" : undefined} placeholder="Tu contraseña" className="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] pl-10 pr-3 text-sm placeholder:text-[var(--muted)]" required />
        </span>
        {state.fieldErrors?.password?.[0] && <span id="password-error" className="mt-2 block text-sm text-[var(--danger)]">{state.fieldErrors.password[0]}</span>}
      </label>
      <button type="submit" disabled={isPending} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55">
        {isPending ? "Validando acceso…" : "Entrar de forma segura"}
        {!isPending && <IconArrowRight size={17} stroke={2} aria-hidden="true" />}
      </button>
      <p className="text-center text-xs leading-5 text-[var(--muted)]">Tu sesión usa cookies seguras y permisos definidos por rol.</p>
    </form>
  );
}
