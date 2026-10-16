import { publicOnboarding } from "@/lib/auth/onboarding.server";
import { registerSchema } from "@/lib/auth/onboarding-schemas";
export function POST(request: Request) { return publicOnboarding(request, "/auth/register", registerSchema, "register"); }
