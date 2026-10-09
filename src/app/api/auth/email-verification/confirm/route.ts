import { publicOnboarding } from "@/lib/auth/onboarding.server";
import { confirmSchema } from "@/lib/auth/onboarding-schemas";
export function POST(request: Request) { return publicOnboarding(request, "/auth/email-verification/confirm", confirmSchema, "confirm"); }
