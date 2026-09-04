import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { GatewayRequestError, gatewayJson } from "@/lib/auth/gateway-client.server";
import type { Role, SessionUser } from "@/lib/auth/roles";

export const ACCESS_TOKEN_COOKIE = "departamental_access";
export const REFRESH_TOKEN_COOKIE = "departamental_refresh";

const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["ADMIN", "EMPLOYEE", "CUSTOMER"]),
});

const meResponseSchema = z.object({ user: userSchema });

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;

  const { body, correlationId, response } = await gatewayJson<unknown>("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new GatewayRequestError("No fue posible validar la sesión.", response.status, correlationId);
  }

  const parsed = meResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new GatewayRequestError("El servicio de identidad devolvió una sesión inválida.", 502, correlationId);
  }

  return parsed.data.user;
}

export async function requireUser(nextPath: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

export async function requireRole(allowedRoles: readonly Role[], nextPath: string) {
  const user = await requireUser(nextPath);
  if (!allowedRoles.includes(user.role)) redirect("/forbidden");
  return user;
}
