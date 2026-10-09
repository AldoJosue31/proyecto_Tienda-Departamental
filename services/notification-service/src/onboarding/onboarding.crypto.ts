import { createDecipheriv } from "node:crypto";
import type { EncryptedOnboardingContent, OnboardingDeliveryRecord } from "./onboarding.types";

export class InvalidOnboardingContentError extends Error {
  constructor() { super("Invalid encrypted onboarding content."); }
}

function base64url(value: unknown, length?: number): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value)
    && (length === undefined || Buffer.from(value, "base64url").length === length);
}

export function encryptedContent(value: unknown): value is EncryptedOnboardingContent {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return base64url(body.iv, 12) && base64url(body.tag, 16)
    && base64url(body.ciphertext) && body.ciphertext.length <= 2_048;
}

export function decryptOnboardingToken(record: OnboardingDeliveryRecord, key: string): string {
  if (!encryptedContent(record.encrypted)) throw new InvalidOnboardingContentError();
  const plaintext: Buffer[] = [];
  let combined: Buffer | undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "base64url"), Buffer.from(record.encrypted.iv, "base64url"));
    decipher.setAAD(Buffer.from(`${record.challengeId}:${record.purpose}:${record.generation}`));
    decipher.setAuthTag(Buffer.from(record.encrypted.tag, "base64url"));
    plaintext.push(decipher.update(Buffer.from(record.encrypted.ciphertext, "base64url")));
    plaintext.push(decipher.final());
    combined = Buffer.concat(plaintext);
    const value = JSON.parse(combined.toString("utf8")) as unknown;
    if (typeof value !== "object" || value === null || !("token" in value)
      || typeof value.token !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(value.token)) throw new InvalidOnboardingContentError();
    return value.token;
  } catch {
    throw new InvalidOnboardingContentError();
  } finally {
    for (const buffer of plaintext) buffer.fill(0);
    combined?.fill(0);
  }
}

export function onboardingLink(record: OnboardingDeliveryRecord, publicOrigin: string, returnPath: string | null, token: string): string {
  const origin = new URL(publicOrigin);
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash
    || (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))) throw new InvalidOnboardingContentError();
  const link = new URL(record.purpose === "EMAIL_VERIFICATION" ? "/verify-email" : "/accept-invitation", origin);
  if (returnPath && returnPath.startsWith("/") && !returnPath.startsWith("//")
    && !returnPath.includes("\\") && ![...returnPath].some((character) => character.charCodeAt(0) < 32) && !/%(?:5c|00|0a|0d)/i.test(returnPath)) {
    const next = new URL(returnPath, origin);
    if (next.origin === origin.origin && !next.hash && ![...next.searchParams.keys()].some((name) => /token|password|secret/i.test(name))) {
      link.searchParams.set("next", next.pathname + next.search);
    }
  }
  link.hash = "token=" + encodeURIComponent(token);
  return link.toString();
}
