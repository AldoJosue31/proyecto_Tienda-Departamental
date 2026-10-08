import { z } from "zod";

const instant = z.string().datetime({ offset: true });
const target = z.object({ scope: z.enum(["ALL", "PRODUCT", "CATEGORY", "VARIANT"]), targetId: z.string().uuid().optional() })
  .refine((value) => value.scope === "ALL" ? !value.targetId : Boolean(value.targetId), "Selecciona un alcance válido.");

export const promotionInputSchema = z.object({
  name: z.string().trim().min(3).max(160), discountType: z.enum(["PERCENTAGE", "FIXED"]),
  discountValue: z.number().positive().max(9999999.99), priority: z.number().int().min(0).max(1000),
  startsAt: instant, endsAt: instant,
  timezone: z.string().min(1).max(64).refine((value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Zona horaria inválida."),
  targets: z.array(target).min(1).max(100),
}).refine((value) => Date.parse(value.startsAt) < Date.parse(value.endsAt), "El final debe ser posterior al inicio.")
  .refine((value) => value.discountType !== "PERCENTAGE" || value.discountValue <= 100, "El porcentaje máximo es 100.");

export type PromotionInput = z.infer<typeof promotionInputSchema>;
export type Promotion = Omit<PromotionInput, "targets"> & { targets: Array<{ scope: PromotionInput["targets"][number]["scope"]; targetId?: string | null }>; id: string; status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "EXPIRED"; createdAt: string; updatedAt: string };
