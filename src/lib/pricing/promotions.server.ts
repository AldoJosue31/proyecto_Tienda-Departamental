import "server-only";
import { cookies } from "next/headers";
import { gatewayJson } from "@/lib/auth/gateway-client.server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session.server";
import type { Promotion } from "./promotions-schema";

export async function getPromotions(): Promise<{ promotions: Promotion[] }> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) throw new Error("Debes iniciar sesión.");
  const { body, response } = await gatewayJson<{ promotions: Promotion[]; message?: string }>("/promotions", { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok || !Array.isArray(body.promotions)) throw new Error(body.message ?? "No fue posible consultar promociones.");
  return body;
}
