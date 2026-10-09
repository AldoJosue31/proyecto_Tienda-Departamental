import { publicOnboarding } from "@/lib/auth/onboarding.server";
import { resendSchema } from "@/lib/auth/onboarding-schemas";
export function POST(request: Request) { return publicOnboarding(request, "/auth/email-verification/resend", resendSchema, "resend"); }
