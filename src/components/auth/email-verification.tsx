"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { AccountRequestError, accountRequest } from "@/lib/auth/onboarding-client";
import { fieldErrors, passwordPairSchema } from "@/lib/auth/onboarding-ui";
import { safeReturnPath } from "@/lib/auth/safe-return-path";
import { FormMessage, PasswordFields, primaryButton, useLinkToken } from "./account-form-parts";
import { VerificationResend } from "./verification-resend";

export function EmailVerification({ nextPath }: { nextPath: string }) {
  const link = useLinkToken();
  return <VerificationForm key={link.token || "missing"} link={link} nextPath={nextPath} />;
}

function VerificationForm({ link, nextPath }: { link: { ready: boolean; token: string | null }; nextPath: string }) {
  const [pending, setPending] = useState(false), [needsPassword, setNeedsPassword] = useState(false), [error, setError] = useState(""), [errors, setErrors] = useState<Record<string, string>>({}), [destination, setDestination] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current || !link.token) return;
    let password: string | undefined;
    if (needsPassword) {
      const values = new FormData(event.currentTarget), parsed = passwordPairSchema.safeParse({ password: values.get("password"), confirmation: values.get("confirmation") });
      if (!parsed.success) { setErrors(fieldErrors(parsed.error)); (event.currentTarget.elements.namedItem(String(parsed.error.issues[0]?.path[0])) as HTMLElement | null)?.focus(); return; }
      password = parsed.data.password;
    }
    inFlight.current = true; setPending(true); setError(""); setErrors({});
    try { const result = await accountRequest("/api/auth/email-verification/confirm", "POST", { token: link.token, ...(password ? { password } : {}) }) as { returnPath?: string }; setDestination(safeReturnPath(result.returnPath || nextPath)); }
    catch (failure) { if (failure instanceof AccountRequestError && failure.code === "PASSWORD_CONFIRMATION_REQUIRED") setNeedsPassword(true); setError((failure as Error).message); }
    finally { inFlight.current = false; setPending(false); }
  }
  if (!link.ready) return <p role="status" className="text-sm text-[var(--muted)]">Preparando la confirmación…</p>;
  if (destination !== null) return <div className="space-y-6"><FormMessage>Correo confirmado. Tu cuenta está lista; inicia sesión para continuar.</FormMessage><Link className={primaryButton + " w-full"} href={`/login?next=${encodeURIComponent(destination)}`}>Iniciar sesión</Link></div>;
  return <>{!link.token ? <FormMessage error>Este enlace no contiene una verificación válida. Solicita otro enlace con el correo de tu registro.</FormMessage> : <form onSubmit={submit} className="space-y-5" noValidate>{error && <FormMessage error>{error}</FormMessage>}{needsPassword && <fieldset disabled={pending} className="space-y-5"><PasswordFields errors={errors} /></fieldset>}<button className={primaryButton + " w-full"} disabled={pending}>{pending ? "Confirmando correo…" : needsPassword ? "Guardar contraseña y confirmar" : "Confirmar mi correo"}</button></form>}<VerificationResend /><Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent-strong)] underline underline-offset-4">Volver al login</Link></>;
}
