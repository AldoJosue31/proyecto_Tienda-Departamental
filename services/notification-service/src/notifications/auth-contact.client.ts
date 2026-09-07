import { Inject, Injectable } from "@nestjs/common";
import { NOTIFICATION_RUNTIME_CONFIG } from "./notification.config";
import type { NotificationRuntimeConfig } from "../config/environment";
import type { NotificationContact } from "./notification.types";

@Injectable()
export class AuthContactClient {
  constructor(@Inject(NOTIFICATION_RUNTIME_CONFIG) private readonly config: Pick<NotificationRuntimeConfig, "authServiceUrl" | "internalServiceKey">) {}

  async findContact(customerId: string, correlationId: string | null): Promise<NotificationContact | null> {
    const signal = AbortSignal.timeout(5_000);
    let response: Response;
    try { response = await fetch(this.config.authServiceUrl + "/internal/users/" + encodeURIComponent(customerId) + "/notification-contact", { headers: { "x-internal-service-key": this.config.internalServiceKey, ...(correlationId ? { "x-correlation-id": correlationId } : {}) }, signal }); }
    catch { throw new Error("Auth contact lookup is unavailable."); }
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Auth contact lookup failed.");
    const body = await response.json().catch(() => null) as unknown;
    if (!this.object(body) || !this.object(body.contact) || body.contact.customerId !== customerId || typeof body.contact.email !== "string") throw new Error("Auth returned an invalid notification contact.");
    return { customerId, email: body.contact.email };
  }

  private object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
}
