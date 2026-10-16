import { employeeRequest } from "@/lib/auth/onboarding.server";
import { employeeQuerySchema } from "@/lib/auth/onboarding-schemas";
export function GET(request: Request) { return employeeRequest(request, "/auth/employees", employeeQuerySchema); }
