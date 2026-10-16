import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import type { NotificationRuntimeConfig } from "../config/environment";
import { DatabaseService } from "../database/database.service";
import { EmailProvider } from "../notifications/email.provider";
import { NOTIFICATION_RUNTIME_CONFIG } from "../notifications/notification.config";
import { AuthOnboardingClient } from "./auth-onboarding.client";
import { decryptOnboardingToken, InvalidOnboardingContentError, onboardingLink } from "./onboarding.crypto";
import type { EncryptedOnboardingContent, OnboardingDeliveryRecord, OnboardingDeliveryStatus, OnboardingEmailRequestedEvent, OnboardingPurpose } from "./onboarding.types";

interface DeliveryRow extends QueryResultRow {
  id: string;
  challenge_id: string;
  user_id: string;
  purpose: OnboardingPurpose;
  generation: number;
  expires_at: Date | string;
  correlation_id: string | null;
  encrypted_content: EncryptedOnboardingContent | null;
  status: OnboardingDeliveryStatus;
  attempts: number;
  next_retry_at: Date | string | null;
  locked_until: Date | string | null;
}
type Outcome = "SENT" | "SIMULATED" | "FAILED" | "UNDELIVERABLE";
type FailureCode = "AUTHORIZATION_REVOKED" | "CHALLENGE_EXPIRED" | "INVALID_ENCRYPTED_CONTENT" | "DELIVERY_FAILED" | "RETRY_LIMIT_EXHAUSTED";
const COLUMNS = "id, challenge_id, user_id, purpose, generation, expires_at, correlation_id, encrypted_content, status, attempts, next_retry_at, locked_until";
const TERMINAL = new Set(["SENT", "SIMULATED", "UNDELIVERABLE"]);

@Injectable()
export class OnboardingDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OnboardingDeliveryService.name);
  private retryTimer: NodeJS.Timeout | null = null;
  private retrying = false;
  constructor(
    private readonly database: DatabaseService,
    private readonly authorizations: AuthOnboardingClient,
    private readonly email: EmailProvider,
    @Inject(NOTIFICATION_RUNTIME_CONFIG) private readonly config: Pick<NotificationRuntimeConfig, "environment" | "onboardingEmailKey" | "retryIntervalSeconds" | "retryLimit">,
  ) {}

  onModuleInit(): void {
    if (this.config.environment === "test") return;
    this.retryTimer = setInterval(() => void this.retryDue().catch(() => this.logger.warn("Onboarding deliveries will resume after the database recovers.")), this.config.retryIntervalSeconds * 1_000);
    this.retryTimer.unref();
    void this.retryDue().catch(() => this.logger.warn("Onboarding deliveries will resume after the database recovers."));
  }
  onModuleDestroy(): void { if (this.retryTimer) clearInterval(this.retryTimer); }

  async receive(event: OnboardingEmailRequestedEvent): Promise<void> {
    const id = await this.database.withTransaction(async (client) => {
      const received = await client.query<{ event_id: string }>(
        "INSERT INTO notification_onboarding_received_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id",
        [event.eventId, event.eventType],
      );
      if (!received.rows[0]) return null;
      const delivery = await client.query<{ id: string }>([
        "INSERT INTO notification_onboarding_deliveries (challenge_id, user_id, purpose, generation, expires_at, correlation_id, encrypted_content)",
        "VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)",
        "ON CONFLICT (challenge_id, generation) DO NOTHING RETURNING id",
      ].join("\n"), [event.challengeId, event.userId, event.purpose, event.generation, event.expiresAt, event.correlationId, JSON.stringify(event.encrypted)]);
      return delivery.rows[0]?.id ?? null;
    });
    if (id) await this.deliver(id);
  }

  private async retryDue(): Promise<void> {
    if (this.retrying) return;
    this.retrying = true;
    try {
      const due = await this.database.query<{ id: string }>([
        "SELECT id FROM notification_onboarding_deliveries",
        "WHERE status = 'PENDING'",
        "OR (status = 'FAILED' AND attempts < $1 AND (next_retry_at <= NOW() OR expires_at <= NOW()))",
        "OR (status = 'PROCESSING' AND locked_until < NOW())",
        "ORDER BY expires_at ASC, updated_at ASC LIMIT 25",
      ].join("\n"), [this.config.retryLimit]);
      for (const row of due.rows) await this.deliver(row.id);
    } finally { this.retrying = false; }
  }

  private async deliver(id: string): Promise<void> {
    const claimed = await this.claim(id);
    if (!claimed) return;
    const { record, exhausted } = claimed;
    if (exhausted) { await this.finish(record, "FAILED", null, "RETRY_LIMIT_EXHAUSTED"); return; }
    if (Date.parse(record.expiresAt) <= Date.now()) { await this.finish(record, "UNDELIVERABLE", null, "CHALLENGE_EXPIRED"); return; }
    let outcome: Outcome;
    let providerMessageId: string | null = null;
    let failureCode: FailureCode | null = null;
    try {
      const authorization = await this.authorizations.authorize(record);
      if (!authorization) {
        outcome = "UNDELIVERABLE";
        failureCode = "AUTHORIZATION_REVOKED";
      } else if (Math.min(Date.parse(record.expiresAt), Date.parse(authorization.expiresAt)) <= Date.now()) {
        outcome = "UNDELIVERABLE";
        failureCode = "CHALLENGE_EXPIRED";
      } else {
        const token = decryptOnboardingToken(record, this.config.onboardingEmailKey);
        const link = onboardingLink(record, authorization.publicOrigin, authorization.returnPath, token);
        const sent = await this.email.sendOnboarding({
          challengeId: record.challengeId,
          purpose: record.purpose,
          email: authorization.contact.email,
          name: authorization.contact.name,
          link,
          expiresAt: authorization.expiresAt,
        });
        outcome = sent.simulated ? "SIMULATED" : "SENT";
        providerMessageId = sent.messageId;
      }
    } catch (error) {
      // Never include provider errors, the token, the link or decrypted content in a log or row.
      outcome = error instanceof InvalidOnboardingContentError ? "UNDELIVERABLE" : "FAILED";
      failureCode = error instanceof InvalidOnboardingContentError ? "INVALID_ENCRYPTED_CONTENT" : "DELIVERY_FAILED";
    }
    // Database commit failures must not turn an accepted SMTP message into a delivery failure.
    await this.finish(record, outcome, providerMessageId, failureCode);
  }

  private async claim(id: string): Promise<{ record: OnboardingDeliveryRecord; exhausted: boolean } | null> {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<DeliveryRow>("SELECT " + COLUMNS + " FROM notification_onboarding_deliveries WHERE id = $1 FOR UPDATE", [id]);
      const row = result.rows[0];
      if (!row || TERMINAL.has(row.status) || (row.status === "FAILED" && row.attempts >= this.config.retryLimit)) return null;
      if (row.status === "PROCESSING" && row.locked_until && new Date(row.locked_until).getTime() > Date.now()) return null;
      if (row.status === "FAILED" && row.next_retry_at && new Date(row.next_retry_at).getTime() > Date.now() && new Date(row.expires_at).getTime() > Date.now()) return null;
      const exhausted = row.attempts >= this.config.retryLimit;
      const updated = await client.query<DeliveryRow>([
        "UPDATE notification_onboarding_deliveries SET status = 'PROCESSING', attempts = attempts + $2, next_retry_at = NULL, locked_until = NOW() + INTERVAL '30 seconds'",
        "WHERE id = $1 RETURNING " + COLUMNS,
      ].join("\n"), [id, exhausted ? 0 : 1]);
      const current = updated.rows[0];
      return current ? { record: this.record(current), exhausted } : null;
    });
  }

  private async finish(record: OnboardingDeliveryRecord, outcome: Outcome, providerMessageId: string | null, failureCode: FailureCode | null = null): Promise<void> {
    await this.database.withTransaction(async (client) => {
      const result = await client.query<DeliveryRow>("SELECT " + COLUMNS + " FROM notification_onboarding_deliveries WHERE id = $1 FOR UPDATE", [record.id]);
      const current = result.rows[0];
      if (!current || current.status !== "PROCESSING" || current.attempts !== record.attempts) return;
      const willRetry = outcome === "FAILED" && record.attempts < this.config.retryLimit && Date.parse(record.expiresAt) > Date.now();
      const nextRetry = willRetry ? new Date(Math.min(Date.parse(record.expiresAt), Date.now() + this.config.retryIntervalSeconds * 1_000)) : null;
      await client.query([
        "UPDATE notification_onboarding_deliveries SET status = $2, provider_message_id = COALESCE($3, provider_message_id), failure_code = $4, next_retry_at = $5, locked_until = NULL,",
        "encrypted_content = CASE WHEN $6 THEN encrypted_content ELSE NULL END WHERE id = $1",
      ].join("\n"), [record.id, outcome, providerMessageId, failureCode, nextRetry, willRetry]);
      const payload = JSON.stringify({
        challengeId: record.challengeId,
        userId: record.userId,
        purpose: record.purpose,
        generation: record.generation,
        status: outcome,
        attempt: record.attempts,
        willRetry,
        ...(providerMessageId ? { providerMessageId } : {}),
      });
      await client.query([
        "INSERT INTO notification_onboarding_outbox_events (delivery_id, attempt, correlation_id, payload)",
        "VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (delivery_id, attempt) DO NOTHING",
      ].join("\n"), [record.id, record.attempts, record.correlationId, payload]);
    });
  }

  private record(row: DeliveryRow): OnboardingDeliveryRecord {
    return {
      id: row.id,
      challengeId: row.challenge_id,
      userId: row.user_id,
      purpose: row.purpose,
      generation: row.generation,
      expiresAt: new Date(row.expires_at).toISOString(),
      correlationId: row.correlation_id,
      attempts: row.attempts,
      encrypted: row.encrypted_content,
    };
  }
}
