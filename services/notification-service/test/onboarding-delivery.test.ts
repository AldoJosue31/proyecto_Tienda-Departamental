import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { OnboardingDeliveryService } from "../src/onboarding/onboarding-delivery.service";
import type { OnboardingDeliveryRecord, OnboardingEmailRequestedEvent } from "../src/onboarding/onboarding.types";

function fixture(options: { simulated?: boolean; expired?: boolean; revoked?: boolean; failed?: boolean } = {}) {
  const key = randomBytes(32);
  const token = randomBytes(32).toString("base64url");
  const row = {
    id: randomUUID(), challenge_id: randomUUID(), user_id: randomUUID(), purpose: "EMAIL_VERIFICATION" as const,
    generation: 1, expires_at: new Date(options.expired ? 0 : Date.now() + 60_000), correlation_id: null,
    encrypted_content: null as { iv: string; tag: string; ciphertext: string } | null,
    status: "PENDING", attempts: 0, next_retry_at: null as Date | null, locked_until: null as Date | null,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${row.challenge_id}:${row.purpose}:${row.generation}`));
  row.encrypted_content = { iv: iv.toString("base64url"), ciphertext: Buffer.concat([cipher.update(JSON.stringify({ token })), cipher.final()]).toString("base64url"), tag: cipher.getAuthTag().toString("base64url") };
  const writes: { sql: string; values: unknown[] }[] = [];
  const outcomes: Record<string, unknown>[] = [];
  const received = new Set<string>();
  const created = new Set<string>();
  let failCommit = false;
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith("SELECT")) return { rows: [{ ...row }] };
    writes.push({ sql, values });
    if (sql.startsWith("INSERT INTO notification_onboarding_received_events")) {
      const eventId = String(values[0]);
      if (received.has(eventId)) return { rows: [] };
      received.add(eventId);
      return { rows: [{ event_id: eventId }] };
    }
    if (sql.startsWith("INSERT INTO notification_onboarding_deliveries")) {
      const identity = String(values[0]) + ":" + String(values[3]);
      if (created.has(identity)) return { rows: [] };
      created.add(identity);
      return { rows: [{ id: row.id }] };
    }
    if (sql.includes("SET status = 'PROCESSING'")) {
      row.status = "PROCESSING"; row.attempts += Number(values[1]); row.locked_until = new Date(Date.now() + 30_000);
      return { rows: [{ ...row }] };
    }
    if (sql.startsWith("UPDATE notification_onboarding_deliveries")) {
      if (failCommit) throw new Error("database unavailable");
      row.status = String(values[1]); row.next_retry_at = values[4] as Date | null; row.locked_until = null;
      if (!values[5]) row.encrypted_content = null;
    }
    if (sql.startsWith("INSERT INTO notification_onboarding_outbox_events")) outcomes.push(JSON.parse(String(values[3])) as Record<string, unknown>);
    return { rows: [] };
  });
  const database = { query, withTransaction: (operation: (client: { query: typeof query }) => unknown) => operation({ query }) };
  const authorize = vi.fn().mockResolvedValue(options.revoked ? null : {
    authorized: true, contact: { userId: row.user_id, email: "customer@example.test", name: "Cliente" },
    publicOrigin: "http://localhost:3105", returnPath: "/checkout", expiresAt: row.expires_at.toISOString(),
  });
  const sendOnboarding = options.failed ? vi.fn().mockRejectedValue(new Error("SMTP unavailable")) : vi.fn().mockResolvedValue({ messageId: "smtp-fixture", simulated: options.simulated ?? false });
  const service = new OnboardingDeliveryService(database as never, { authorize } as never, { sendOnboarding } as never, { environment: "test", onboardingEmailKey: key.toString("base64url"), retryIntervalSeconds: 1, retryLimit: 3 });
  const internals = service as unknown as {
    deliver(id: string): Promise<void>;
    finish(record: OnboardingDeliveryRecord, status: "FAILED", messageId: null): Promise<void>;
  };
  const event: OnboardingEmailRequestedEvent = {
    eventId: randomUUID(), eventType: "auth.email.verification.requested.v1", occurredAt: new Date().toISOString(),
    correlationId: null, challengeId: row.challenge_id, userId: row.user_id, purpose: row.purpose,
    generation: row.generation, expiresAt: row.expires_at.toISOString(), encrypted: row.encrypted_content!,
  };
  return { service, internals, row, token, authorize, sendOnboarding, writes, outcomes, event, setCommitFailure: () => { failCommit = true; } };
}

describe("Onboarding delivery lifecycle", () => {
  it("authorizes before SMTP, scrubs encrypted content and emits a separate acceptance result", async () => {
    const current = fixture();
    await current.internals.deliver(current.row.id);
    expect(current.authorize.mock.invocationCallOrder[0]).toBeLessThan(current.sendOnboarding.mock.invocationCallOrder[0]!);
    expect(current.row.status).toBe("SENT");
    expect(current.row.encrypted_content).toBeNull();
    expect(current.outcomes).toEqual([expect.objectContaining({ challengeId: current.row.challenge_id, status: "SENT", attempt: 1, willRetry: false })]);
    expect(JSON.stringify(current.writes)).not.toContain(current.token);
    expect(JSON.stringify(current.outcomes)).not.toContain("@example.test");
    expect(JSON.stringify(current.writes)).not.toContain("notification_outbox_events ");
  });

  it("distinguishes simulation and never reports SMTP acceptance", async () => {
    const current = fixture({ simulated: true });
    await current.internals.deliver(current.row.id);
    expect(current.row.status).toBe("SIMULATED");
    expect(current.row.encrypted_content).toBeNull();
    expect(current.outcomes[0]).toMatchObject({ status: "SIMULATED", willRetry: false });
  });

  it("does not send expired or revoked challenges", async () => {
    for (const options of [{ expired: true }, { revoked: true }]) {
      const current = fixture(options);
      await current.internals.deliver(current.row.id);
      expect(current.sendOnboarding).not.toHaveBeenCalled();
      expect(current.row.status).toBe("UNDELIVERABLE");
      expect(current.row.encrypted_content).toBeNull();
      expect(current.outcomes[0]).toMatchObject({ status: "UNDELIVERABLE", willRetry: false });
    }
  });

  it("bounds SMTP retries, preserves ciphertext only while recoverable and reauthorizes each attempt", async () => {
    const current = fixture({ failed: true });
    await current.internals.deliver(current.row.id);
    expect(current.row.status).toBe("FAILED");
    expect(current.row.encrypted_content).not.toBeNull();
    expect(current.outcomes[0]).toMatchObject({ status: "FAILED", attempt: 1, willRetry: true });
    current.row.next_retry_at = new Date(0);
    await current.internals.deliver(current.row.id);
    current.row.next_retry_at = new Date(0);
    await current.internals.deliver(current.row.id);
    await current.internals.deliver(current.row.id);
    expect(current.sendOnboarding).toHaveBeenCalledTimes(3);
    expect(current.authorize).toHaveBeenCalledTimes(3);
    expect(current.row.encrypted_content).toBeNull();
    expect(current.outcomes[2]).toMatchObject({ status: "FAILED", attempt: 3, willRetry: false });
  });

  it("recovers expired leases and stops a crashed final attempt without exceeding the limit", async () => {
    const current = fixture();
    current.row.status = "PROCESSING"; current.row.attempts = 1; current.row.locked_until = new Date(0);
    await current.internals.deliver(current.row.id);
    expect(current.row.status).toBe("SENT");
    expect(current.outcomes[0]).toMatchObject({ attempt: 2 });
    const exhausted = fixture();
    exhausted.row.status = "PROCESSING"; exhausted.row.attempts = 3; exhausted.row.locked_until = new Date(0);
    await exhausted.internals.deliver(exhausted.row.id);
    expect(exhausted.sendOnboarding).not.toHaveBeenCalled();
    expect(exhausted.row.encrypted_content).toBeNull();
    expect(exhausted.outcomes[0]).toMatchObject({ status: "FAILED", attempt: 3, willRetry: false });
  });

  it("deduplicates event replay and another event for the same challenge", async () => {
    const current = fixture();
    await current.service.receive(current.event);
    await current.service.receive(current.event);
    await current.service.receive({ ...current.event, eventId: randomUUID() });
    expect(current.sendOnboarding).toHaveBeenCalledTimes(1);
    expect(current.row.attempts).toBe(1);
    expect(current.outcomes).toHaveLength(1);
  });

  it("does not overwrite acceptance with a late failure from an older claim", async () => {
    const current = fixture();
    const record: OnboardingDeliveryRecord = {
      id: current.row.id, challengeId: current.row.challenge_id, userId: current.row.user_id, purpose: current.row.purpose,
      generation: 1, expiresAt: current.row.expires_at.toISOString(), correlationId: null, attempts: 1, encrypted: current.row.encrypted_content,
    };
    current.row.status = "SENT"; current.row.attempts = 2;
    await current.internals.finish(record, "FAILED", null);
    expect(current.row.status).toBe("SENT");
    expect(current.outcomes).toHaveLength(0);
  });

  it("does not classify a database failure after SMTP acceptance as SMTP failure", async () => {
    const current = fixture();
    current.setCommitFailure();
    await expect(current.internals.deliver(current.row.id)).rejects.toThrow("database unavailable");
    expect(current.sendOnboarding).toHaveBeenCalledTimes(1);
    expect(current.writes.filter((entry) => entry.sql.startsWith("UPDATE notification_onboarding_deliveries") && entry.values[1] === "FAILED")).toHaveLength(0);
  });
});
