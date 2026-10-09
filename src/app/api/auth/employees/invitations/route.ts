import { employeeRequest } from "@/lib/auth/onboarding.server";
import { inviteSchema } from "@/lib/auth/onboarding-schemas";
export function POST(request: Request) { return employeeRequest(request, "/auth/employees/invitations", inviteSchema); }
