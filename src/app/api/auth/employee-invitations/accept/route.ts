import { publicOnboarding } from "@/lib/auth/onboarding.server";
import { acceptSchema } from "@/lib/auth/onboarding-schemas";
export function POST(request: Request) { return publicOnboarding(request, "/auth/employee-invitations/accept", acceptSchema, "accept"); }
