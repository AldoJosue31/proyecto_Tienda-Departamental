"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { LoginState } from "@/app/login/login-state";
import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth/session.server";

const loginSchema = z.object({
  email: z.string().email("Escribe un correo válido.").trim(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(128),
  next: z.string().optional(),
});

const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number().int().positive(),
  refreshExpiresIn: z.number().int().positive(),
  user: z.object({
    id: z.string().min(1),
    email: z.string().email(),
    name: z.string().min(1),
    role: z.enum(["ADMIN", "EMPLOYEE", "CUSTOMER"]),
  }),
});

type LoginPayload = z.infer<typeof loginResponseSchema>;

function safeNextPath(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

function setSessionCookies(payload: LoginPayload, cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.set(ACCESS_TOKEN_COOKIE, payload.accessToken, cookieOptions(payload.expiresIn));
  cookieStore.set(REFRESH_TOKEN_COOKIE, payload.refreshToken, cookieOptions(payload.refreshExpiresIn));
}

function errorMessage(body: unknown, fallback: string) {
  if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") return body.message;
  return fallback;
}

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  let result: { body: unknown; response: Response };
  try {
    result = await gatewayJson<unknown>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: parsed.data.email, password: parsed.data.password }),
    });
  } catch (error) {
    return { message: error instanceof GatewayRequestError ? "El acceso no está disponible en este momento. Intenta nuevamente." : "No fue posible iniciar sesión." };
  }

  if (!result.response.ok) {
    return { message: errorMessage(result.body, "No pudimos validar tus credenciales.") };
  }

  const payload = loginResponseSchema.safeParse(result.body);
  if (!payload.success) return { message: "El servicio de identidad devolvió una respuesta inválida." };

  const cookieStore = await cookies();
  setSessionCookies(payload.data, cookieStore);
  redirect(safeNextPath(parsed.data.next));
}

/** Refreshes the HTTP-only browser session through Kong without exposing tokens to client JavaScript. */
export async function refreshSession() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return { renewed: false };

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const result = await gatewayJson<unknown>("/auth/refresh", {
      method: "POST",
      headers,
      body: JSON.stringify({ refreshToken }),
    });
    if (!result.response.ok) return { renewed: false };

    const payload = loginResponseSchema.safeParse(result.body);
    if (!payload.success) return { renewed: false };
    setSessionCookies(payload.data, cookieStore);
    return { renewed: true };
  } catch {
    return { renewed: false };
  }
}

export async function signOut() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (refreshToken) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      await gatewayJson("/auth/logout", {
        method: "POST",
        headers,
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Local cookies are still cleared when the gateway is temporarily unavailable.
    }
  }

  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
  redirect("/login");
}
