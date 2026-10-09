import { Inject, Injectable } from "@nestjs/common";
import type { NotificationRuntimeConfig } from "../config/environment";
import { NOTIFICATION_RUNTIME_CONFIG } from "../notifications/notification.config";
import type { OnboardingAuthorization, OnboardingDeliveryRecord } from "./onboarding.types";

@Injectable()
export class AuthOnboardingClient {
  constructor(@Inject(NOTIFICATION_RUNTIME_CONFIG) private readonly config: Pick<NotificationRuntimeConfig, "authServiceUrl" | "authOnboardingInternalServiceKey">) {}

  async authorize(record: OnboardingDeliveryRecord): Promise<OnboardingAuthorization | null> {
    let response: Response;
    try {
      response = await fetch(this.config.authServiceUrl + "/internal/auth/onboarding-deliveries/authorize", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-service-key": this.config.authOnboardingInternalServiceKey,
          ...(record.correlationId ? { "x-correlation-id": record.correlationId } : {}),
        },
        body: JSON.stringify({ challengeId: record.challengeId, userId: record.userId, purpose: record.purpose, generation: record.generation }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch { throw new Error("Auth onboarding authorization is unavailable."); }
    if (!response.ok) throw new Error("Auth onboarding authorization failed.");
    const value = await response.json().catch(() => null) as unknown;
    if (!this.object(value)) throw new Error("Auth onboarding authorization returned an invalid response.");
    if (value.authorized === false) return null;
    if (value.authorized !== true || !this.object(value.contact) || value.contact.userId !== record.userId
      || typeof value.contact.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contact.email)
      || typeof value.contact.name !== "string" || typeof value.publicOrigin !== "string"
      || (value.returnPath !== null && typeof value.returnPath !== "string")
      || typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))) {
      throw new Error("Auth onboarding authorization returned an invalid response.");
    }
    return {
      authorized: true,
      contact: { userId: record.userId, email: value.contact.email.trim().toLowerCase(), name: value.contact.name },
      publicOrigin: value.publicOrigin,
      returnPath: value.returnPath,
      expiresAt: value.expiresAt,
    };
  }

  private object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
}
