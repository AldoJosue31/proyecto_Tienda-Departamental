import { z } from "zod";

export const newPasswordSchema = z.string().refine(value => Array.from(value).length >= 15, "Usa al menos 15 caracteres.").refine(value => new TextEncoder().encode(value).length <= 72, "La contraseña supera los 72 bytes permitidos.");
export const emailSchema = z.string().trim().email("Escribe un correo válido.").max(320).transform(value => value.toLowerCase());
export const onboardingTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/, "El enlace no es válido.");
export const registerSchema = z.object({ name: z.string().trim().min(1, "Escribe tu nombre.").max(120, "Usa un nombre de hasta 120 caracteres."), email: emailSchema, password: newPasswordSchema, returnPath: z.string().max(512).optional() }).strict();
export const resendSchema = z.object({ email: emailSchema }).strict();
export const confirmSchema = z.object({ token: onboardingTokenSchema, password: newPasswordSchema.optional() }).strict();
export const acceptSchema = z.object({ token: onboardingTokenSchema, password: newPasswordSchema }).strict();
export const inviteSchema = z.object({ name: z.string().trim().min(1, "Escribe el nombre del empleado.").max(120, "Usa un nombre de hasta 120 caracteres."), email: emailSchema }).strict();
export const emptyOnboardingSchema = z.object({}).strict();
export const employeeStatusSchema = z.object({ isActive: z.boolean(), authVersion: z.number().int().nonnegative() }).strict();
export const employeeQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), search: z.string().trim().max(120).optional() }).strict();
