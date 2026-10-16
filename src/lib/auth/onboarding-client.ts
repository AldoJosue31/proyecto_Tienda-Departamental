"use client";

const messages: Record<string, string> = {
  PASSWORD_CONFIRMATION_REQUIRED: "Este enlace se abrió en otro navegador. Elige una contraseña nueva para proteger tu cuenta.",
  EMAIL_ALREADY_USED: "Ese correo ya pertenece a una cuenta. Usa otro correo; su perfil actual se conserva.",
  AUTH_VERSION_CONFLICT: "Otro administrador cambió este empleado. Actualizamos la lista; revisa su estado antes de continuar.",
  IDEMPOTENCY_CONFLICT: "La invitación cambió durante el reintento. Revisa los datos y vuelve a enviarla.",
  RESEND_LIMIT: "Espera al menos un minuto entre envíos. Puedes reenviar hasta tres veces por hora.",
  INVITATION_NOT_PENDING: "Solo puedes reenviar a un empleado habilitado cuya invitación siga pendiente.",
  INVALID_OR_EXPIRED_CHALLENGE: "El enlace venció, fue utilizado o se reemplazó. Solicita uno nuevo.",
  INVALID_CHALLENGE: "El enlace venció, fue utilizado o se reemplazó. Solicita uno nuevo.",
  INVALID_ONBOARDING_TOKEN: "El enlace venció, fue utilizado o se reemplazó. Solicita uno nuevo.",
  ONBOARDING_RATE_LIMIT: "Alcanzaste el límite de solicitudes. Espera 15 minutos antes de volver a intentar.",
  UNAUTHENTICATED: "Tu sesión terminó. Inicia sesión de nuevo.",
  INVALID_CSRF_TOKEN: "La página perdió su autorización. Vuelve a intentar para renovarla.",
};

export class AccountRequestError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(messages[code] || (status === 401 ? messages.UNAUTHENTICATED : status === 403 ? "No tienes permiso para realizar esta operación." : status === 429 ? "Hay demasiadas solicitudes. Espera antes de volver a intentar." : status === 400 ? "El enlace o los datos no son válidos. Revisa la información y solicita otro enlace si hace falta." : "No pudimos completar la solicitud. Revisa tu conexión y vuelve a intentar."));
  }
}

export async function accountRequest(path: string, method = "GET", body?: unknown, extraHeaders?: Record<string, string>): Promise<unknown> {
  try {
    const headers: Record<string, string> = { ...extraHeaders };
    if (method !== "GET") {
      const context = await fetch("/api/auth/onboarding/context", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!context.ok) throw new AccountRequestError("AUTH_UNAVAILABLE", context.status);
      const data = await context.json();
      if (typeof data.csrfToken !== "string") throw new AccountRequestError("AUTH_UNAVAILABLE", 503);
      headers["X-CSRF-Token"] = data.csrfToken;
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new AccountRequestError(typeof data?.code === "string" ? data.code : "REQUEST_FAILED", response.status);
    return data;
  } catch (error) {
    if (error instanceof AccountRequestError) throw error;
    throw new AccountRequestError("NETWORK_ERROR", 503);
  }
}
