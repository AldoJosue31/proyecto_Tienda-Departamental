import { employeeRequest } from "@/lib/auth/onboarding.server";
import { emptyOnboardingSchema } from "@/lib/auth/onboarding-schemas";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return employeeRequest(request, "/auth/employees/" + encodeURIComponent(id) + "/invitation/resend", emptyOnboardingSchema, id);
}
