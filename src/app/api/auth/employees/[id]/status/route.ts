import { employeeRequest } from "@/lib/auth/onboarding.server";
import { employeeStatusSchema } from "@/lib/auth/onboarding-schemas";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return employeeRequest(request, "/auth/employees/" + encodeURIComponent(id) + "/status", employeeStatusSchema, id);
}
