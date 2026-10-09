"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { accountRequest } from "@/lib/auth/onboarding-client";
import { fieldErrors, registrationFormSchema } from "@/lib/auth/onboarding-ui";
import { AccountField, FormMessage, PasswordFields, primaryButton } from "./account-form-parts";
import { VerificationResend } from "./verification-resend";

export function RegisterForm({ nextPath }: { nextPath: string }) {
  const [errors, setErrors] = useState<Record<string, string>>({}), [error, setError] = useState(""), [pending, setPending] = useState(false), [email, setEmail] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current) return;
    const form = event.currentTarget, values = new FormData(form);
    const parsed = registrationFormSchema.safeParse({ name: values.get("name"), email: values.get("email"), password: values.get("password"), confirmation: values.get("confirmation"), returnPath: nextPath });
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); const name = String(parsed.error.issues[0]?.path[0]); (form.elements.namedItem(name) as HTMLElement | null)?.focus(); return; }
    inFlight.current = true; setPending(true); setError(""); setErrors({});
    const { name, email, password, returnPath } = parsed.data;
    try { await accountRequest("/api/auth/register", "POST", { name, email, password, returnPath }); form.reset(); setEmail(email); }
    catch (failure) { setError((failure as Error).message); }
    finally { inFlight.current = false; setPending(false); }
  }
  if (email) return <><FormMessage>Revisa tu correo. Si el registro procede, recibirás un enlace para confirmar tu cuenta. Comprueba también spam; después podrás iniciar sesión.</FormMessage><VerificationResend initialEmail={email} /><Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent-strong)] underline underline-offset-4">Ir a iniciar sesión</Link></>;
  return <><form onSubmit={submit} className="space-y-5" noValidate>{error && <FormMessage error>{error}</FormMessage>}<fieldset disabled={pending} className="space-y-5"><AccountField name="name" label="Nombre completo" autoComplete="name" required maxLength={120} error={errors.name} /><AccountField name="email" label="Correo electrónico" type="email" autoComplete="email" required maxLength={320} error={errors.email} /><PasswordFields errors={errors} /></fieldset><button className={primaryButton + " w-full"} disabled={pending}>{pending ? "Creando tu cuenta…" : "Crear cuenta de cliente"}</button></form><p className="mt-6 text-sm leading-6 text-[var(--muted)]">¿Ya tienes cuenta? <Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="inline-flex min-h-11 items-center font-semibold text-[var(--accent-strong)] underline underline-offset-4">Inicia sesión</Link></p></>;
}
