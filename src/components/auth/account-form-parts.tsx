"use client";

import { useState, useSyncExternalStore, type InputHTMLAttributes } from "react";
import { tokenFromFragment } from "@/lib/auth/onboarding-ui";

export const primaryButton = "inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55";
export const secondaryButton = "inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-55";

export function AccountField({ label, error, hint, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; name: string }) {
  return <div><label htmlFor={input.name} className="text-sm font-semibold">{label}</label><input {...input} id={input.name} aria-invalid={Boolean(error)} aria-describedby={[error ? `${input.name}-error` : "", hint ? `${input.name}-hint` : ""].filter(Boolean).join(" ") || undefined} className="mt-2 block h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-base placeholder:text-[var(--muted)] sm:text-sm" />{hint && <span id={`${input.name}-hint`} className="mt-2 block text-xs leading-5 text-[var(--muted)]">{hint}</span>}{error && <span id={`${input.name}-error`} className="mt-2 block text-sm text-[var(--danger)]">{error}</span>}</div>;
}
export function FormMessage({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <p role={error ? "alert" : "status"} className="rounded-xl p-4 text-sm leading-6" style={{ background: error ? "var(--danger-surface)" : "var(--success-surface)" }}>{children}</p>;
}
export function PasswordFields({ errors }: { errors: Record<string, string> }) {
  return <><AccountField name="password" label="Contraseña nueva" type="password" autoComplete="new-password" required error={errors.password} hint="Usa una frase de al menos 15 caracteres. Máximo 72 bytes; los acentos y emojis ocupan más de un byte." /><AccountField name="confirmation" label="Confirmar contraseña" type="password" autoComplete="new-password" required error={errors.confirmation} /></>;
}

const loading = { ready: false, token: null as string | null };
// Read the fragment only after hydration. The store retains it in memory after
// removing it from the address bar; React Strict Mode subscriptions are safe.
export function useLinkToken() {
  const [store] = useState(() => {
    let snapshot = loading;
    return {
      getSnapshot: () => snapshot,
      subscribe: (notify: () => void) => {
        const readLink = () => {
          const url = new URL(window.location.href);
          const token = tokenFromFragment(url.hash);
          url.hash = "";
          for (const key of [...url.searchParams.keys()]) if (/token|password|secret|nonce|csrf/i.test(key)) url.searchParams.delete(key);
          window.history.replaceState(window.history.state, "", url.pathname + url.search);
          snapshot = { ready: true, token };
          notify();
        };
        if (!snapshot.ready) readLink();
        // Opening a replacement link on this same route can be a fragment-only
        // navigation, so React may keep the form mounted. Replace its token too.
        window.addEventListener("hashchange", readLink);
        return () => window.removeEventListener("hashchange", readLink);
      },
    };
  });
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => loading);
}
