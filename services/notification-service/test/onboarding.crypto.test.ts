import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptOnboardingToken, InvalidOnboardingContentError, onboardingLink } from "../src/onboarding/onboarding.crypto";
import { parseOnboardingEvent } from "../src/onboarding/onboarding.consumer";
import type { OnboardingDeliveryRecord } from "../src/onboarding/onboarding.types";

function fixture() {
  const key = randomBytes(32);
  const token = randomBytes(32).toString("base64url");
  const record: OnboardingDeliveryRecord = {
    id: randomUUID(), challengeId: randomUUID(), userId: randomUUID(), purpose: "EMAIL_VERIFICATION",
    generation: 1, expiresAt: new Date(Date.now() + 60_000).toISOString(), correlationId: null, attempts: 1, encrypted: null,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${record.challengeId}:${record.purpose}:${record.generation}`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ token }), "utf8"), cipher.final()]);
  record.encrypted = { iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: encrypted.toString("base64url") };
  return { record, key: key.toString("base64url"), token };
}

describe("Onboarding encrypted content", () => {
  it("decrypts only with the challenge, purpose and generation bound to Auth", () => {
    const { record, key, token } = fixture();
    expect(decryptOnboardingToken(record, key)).toBe(token);
    expect(() => decryptOnboardingToken({ ...record, generation: 2 }, key)).toThrow(InvalidOnboardingContentError);
    expect(() => decryptOnboardingToken({ ...record, purpose: "EMPLOYEE_INVITATION" }, key)).toThrow(InvalidOnboardingContentError);
    expect(() => decryptOnboardingToken({ ...record, challengeId: randomUUID() }, key)).toThrow(InvalidOnboardingContentError);
  });

  it("rejects tampering without exposing plaintext in the error", () => {
    const { record, key, token } = fixture();
    record.encrypted = { ...record.encrypted!, tag: randomBytes(16).toString("base64url") };
    expect(() => decryptOnboardingToken(record, key)).toThrow("Invalid encrypted onboarding content.");
    try { decryptOnboardingToken(record, key); } catch (error) { expect(String(error)).not.toContain(token); }
  });

  it("places tokens only in a fragment and keeps the expected fixed page", () => {
    const { record, token } = fixture();
    const link = new URL(onboardingLink(record, "http://localhost:3105", "/checkout?branch=centro", token));
    expect(link.pathname).toBe("/verify-email");
    expect(link.searchParams.get("token")).toBeNull();
    expect(link.hash).toBe("#token=" + token);
    expect(link.searchParams.get("next")).toBe("/checkout?branch=centro");
    expect(new URL(onboardingLink({ ...record, purpose: "EMPLOYEE_INVITATION" }, "https://departamental.example", null, token)).pathname).toBe("/accept-invitation");
  });

  it("rejects attacker origins and ignores unsafe return destinations", () => {
    const { record, token } = fixture();
    for (const origin of ["http://example.test", "https://user:password@example.test", "https://example.test/admin", "https://example.test?token=secret"]) {
      expect(() => onboardingLink(record, origin, null, token)).toThrow(InvalidOnboardingContentError);
    }
    for (const next of ["https://attacker.test", "//attacker.test", "/\\attacker.test", "/%5cattacker.test", "/checkout?token=secret", "/checkout#secret"]) {
      expect(new URL(onboardingLink(record, "http://localhost:3105", next, token)).searchParams.has("next")).toBe(false);
    }
  });

  it("validates event purpose, encrypted field sizes and identity before persisting", () => {
    const { record } = fixture();
    const event = {
      eventId: randomUUID(), eventType: "auth.email.verification.requested.v1", occurredAt: new Date().toISOString(),
      correlationId: null, challengeId: record.challengeId, userId: record.userId, purpose: record.purpose,
      generation: record.generation, expiresAt: record.expiresAt, encrypted: record.encrypted,
    };
    expect(parseOnboardingEvent(event).challengeId).toBe(record.challengeId);
    expect(() => parseOnboardingEvent({ ...event, eventType: "auth.employee.invitation.requested.v1" })).toThrow();
    expect(() => parseOnboardingEvent({ ...event, userId: "invalid" })).toThrow();
    expect(() => parseOnboardingEvent({ ...event, generation: 0 })).toThrow();
    expect(() => parseOnboardingEvent({ ...event, encrypted: { ...event.encrypted, iv: "invalid" } })).toThrow();
  });
});
