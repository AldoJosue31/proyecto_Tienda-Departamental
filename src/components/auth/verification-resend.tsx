"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { accountRequest } from "@/lib/auth/onboarding-client";
import { resendSchema } from "@/lib/auth/onboarding-schemas";
import { AccountField, FormMessage, secondaryButton } from "./account-form-parts";

export function VerificationResend({ initialEmail = "" }: { initialEmail?: string }) {
  const [pending, setPending] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(""), [seconds, setSeconds] = useState(0);
  const inFlight = useRef(false);
  useEffect(() => { if (!seconds) return; const timer = setInterval(() => setSeconds(current => Math.max(0, current - 1)), 1000); return () => clearInterval(timer); }, [seconds]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current || seconds) return;
    const parsed = resendSchema.safeParse({ email: new FormData(event.currentTarget).get("resendEmail") });
    if (!parsed.success) { setError("Escribe un correo válido."); return; }
    inFlight.current = true; setPending(true); setError(""); setMessage("");
    try { await accountRequest("/api/auth/email-verification/resend", "POST", parsed.data); setSeconds(60); setMessage("Si el correo tiene un registro pendiente y puede recibir otro envío, llegará un enlace nuevo. Revisa también spam."); }
    catch (failure) { setError((failure as Error).message); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <section className="mt-8 border-t border-[var(--line)] pt-6"><h2 className="text-base font-semibold">Solicitar otro enlace</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">El enlace más reciente reemplaza al anterior. Espera un minuto entre envíos.</p><form onSubmit={submit} className="mt-4 space-y-4">{message && <FormMessage>{message}</FormMessage>}{error && <FormMessage error>{error}</FormMessage>}<AccountField name="resendEmail" label="Correo de tu registro" type="email" autoComplete="email" defaultValue={initialEmail} required disabled={pending} /><button className={secondaryButton + " w-full"} disabled={pending || seconds > 0}>{pending ? "Solicitando enlace…" : seconds ? `Reenviar en ${seconds} s` : "Reenviar verificación"}</button></form></section>;
}
