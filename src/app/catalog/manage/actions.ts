"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import type { CatalogActionState } from "@/app/catalog/manage/catalog-state";
import { gatewayJson } from "@/lib/auth/gateway-client.server";
import { ACCESS_TOKEN_COOKIE, requireRole } from "@/lib/auth/session.server";

const productSchema = z.object({
  name: z.string().trim().min(2, "Escribe un nombre de al menos 2 caracteres.").max(160),
  description: z.string().trim().max(2_000).optional(),
  category: z.string().trim().min(2, "Indica una categoría.").max(100),
  brand: z.string().trim().min(2, "Indica una marca.").max(100),
  tags: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().max(2_000).optional(),
});

const variantSchema = z.object({
  productId: z.string().uuid("Selecciona un producto válido."),
  sku: z.string().trim().min(3, "El SKU debe tener al menos 3 caracteres.").max(80),
  size: z.string().trim().max(60).optional(),
  color: z.string().trim().max(60).optional(),
  material: z.string().trim().max(80).optional(),
  listPrice: z.coerce.number().positive("El precio de lista debe ser mayor que cero."),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Usa un código ISO de tres letras.").default("MXN"),
});

function fields(formData: FormData) {
  return Object.fromEntries(Array.from(formData.entries()).map(([key, value]) => [key, typeof value === "string" ? value : ""]));
}

function resultMessage(body: unknown, fallback: string) {
  return typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
    ? body.message
    : fallback;
}

async function adminToken() {
  await requireRole(["ADMIN"], "/catalog/manage");
  return (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
}

export async function createCatalogProduct(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const parsed = productSchema.safeParse(fields(formData));
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };

  const accessToken = await adminToken();
  if (!accessToken) return { status: "error", message: "Tu sesión expiró. Inicia sesión de nuevo." };

  const tags = parsed.data.tags?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [];
  const payload = {
    name: parsed.data.name,
    description: parsed.data.description || undefined,
    category: { name: parsed.data.category },
    brand: { name: parsed.data.brand },
    tags,
    imageUrl: parsed.data.imageUrl || undefined,
  };

  try {
    const { body, response } = await gatewayJson<unknown>("/products", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return { status: "error", message: resultMessage(body, "No fue posible crear el producto.") };
  } catch {
    return { status: "error", message: "No fue posible contactar el catálogo." };
  }

  revalidatePath("/");
  revalidatePath("/catalog/manage");
  return { status: "success", message: "Producto creado. Ahora puedes agregar sus variantes." };
}

export async function createCatalogVariant(_previous: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const parsed = variantSchema.safeParse(fields(formData));
  if (!parsed.success) return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };

  const accessToken = await adminToken();
  if (!accessToken) return { status: "error", message: "Tu sesión expiró. Inicia sesión de nuevo." };

  try {
    const { body, response } = await gatewayJson<unknown>(`/products/${encodeURIComponent(parsed.data.productId)}/variants`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        sku: parsed.data.sku,
        size: parsed.data.size || undefined,
        color: parsed.data.color || undefined,
        material: parsed.data.material || undefined,
        listPrice: parsed.data.listPrice,
        currency: parsed.data.currency,
      }),
    });
    if (!response.ok) return { status: "error", message: resultMessage(body, "No fue posible crear la variante.") };
  } catch {
    return { status: "error", message: "No fue posible contactar el catálogo." };
  }

  revalidatePath("/");
  revalidatePath("/catalog/manage");
  return { status: "success", message: "Variante registrada con SKU independiente." };
}
