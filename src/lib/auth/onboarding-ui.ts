import { z } from "zod";
import { newPasswordSchema, registerSchema } from "./onboarding-schemas";

export const passwordPairSchema = z.object({ password: newPasswordSchema, confirmation: z.string() }).refine(value => value.password === value.confirmation, { path: ["confirmation"], message: "Las contraseñas deben coincidir." });
export const registrationFormSchema = registerSchema.extend({ confirmation: z.string() }).refine(value => value.password === value.confirmation, { path: ["confirmation"], message: "Las contraseñas deben coincidir." });

export function fieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(error.issues.map(issue => [String(issue.path[0]), issue.message]).reverse());
}

export function tokenFromFragment(fragment: string): string | null {
  const parameters = new URLSearchParams(fragment.replace(/^#/, ""));
  const tokens = parameters.getAll("token");
  return tokens.length === 1 && /^[A-Za-z0-9_-]{43,128}$/.test(tokens[0]) ? tokens[0] : null;
}

export const employeePageSchema = z.object({
  employees: z.array(z.object({
    id: z.string().uuid(), name: z.string(), email: z.string().email(), role: z.literal("EMPLOYEE"),
    isActive: z.boolean(), onboardingStatus: z.enum(["PENDING_INVITATION", "READY"]), authVersion: z.number().int().nonnegative(),
    emailVerifiedAt: z.string().nullable(), deliveryStatus: z.enum(["PENDING", "SENT", "SIMULATED", "FAILED", "UNDELIVERABLE"]).nullable(), deliveryAttempt: z.number().int().nullable(),
  })),
  pagination: z.object({ page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative() }),
});
export type EmployeePage = z.infer<typeof employeePageSchema>;
export type Employee = EmployeePage["employees"][number];

export const deliveryLabel = { PENDING: "Envío pendiente", SENT: "Correo enviado", SIMULATED: "Envío simulado", FAILED: "Envío fallido", UNDELIVERABLE: "No se pudo entregar" } as const;
