"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { accountRequest } from "@/lib/auth/onboarding-client";
import { fieldErrors, passwordPairSchema } from "@/lib/auth/onboarding-ui";
import { FormMessage, PasswordFields, primaryButton, useLinkToken } from "./account-form-parts";

export function AcceptInvitation() {
  const link = useLinkToken();
  return <InvitationForm key={link.token || "missing"} link={link} />;
}

function InvitationForm({ link }: { link: { ready: boolean; token: string | null } }) {
  const [pending, setPending] = useState(false), [done, setDone] = useState(false), [error, setError] = useState(""), [errors, setErrors] = useState<Record<string, string>>({});
  const inFlight = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current || !link.token) return;
    const form = event.currentTarget, values = new FormData(form), parsed = passwordPairSchema.safeParse({ password: values.get("password"), confirmation: values.get("confirmation") });
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); (form.elements.namedItem(String(parsed.error.issues[0]?.path[0])) as HTMLElement | null)?.focus(); return; }
    inFlight.current = true; setPending(true); setError(""); setErrors({});
    try { await accountRequest("/api/auth/employee-invitations/accept", "POST", { token: link.token, password: parsed.data.password }); form.reset(); setDone(true); }
    catch (failure) { setError((failure as Error).message); }
    finally { inFlight.current = false; setPending(false); }
  }
  if (!link.ready) return <p role="status">Preparando tu invitación…</p>;
  if (done) return <div className="space-y-6"><FormMessage>Invitación aceptada. Tu cuenta de empleado está lista. Inicia sesión con tu correo y la contraseña que elegiste.</FormMessage><Link className={primaryButton + " w-full"} href="/login?next=%2Foperations">Iniciar sesión</Link></div>;
  return <>{!link.token ? <FormMessage error>La invitación no es válida. Pide a tu administrador que la reenvíe.</FormMessage> : <form onSubmit={submit} className="space-y-5" noValidate>{error && <FormMessage error>{error}</FormMessage>}<fieldset disabled={pending} className="space-y-5"><PasswordFields errors={errors} /></fieldset><button disabled={pending} className={primaryButton + " w-full"}>{pending ? "Aceptando invitación…" : "Aceptar invitación"}</button></form>}<p className="mt-6 text-sm leading-6 text-[var(--muted)]">Si el enlace venció o fue utilizado, pide un nuevo envío a tu administrador.</p><Link href="/login" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent-strong)] underline underline-offset-4">Volver al login</Link></>;
}
