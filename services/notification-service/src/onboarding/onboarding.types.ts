export type OnboardingPurpose = "EMAIL_VERIFICATION" | "EMPLOYEE_INVITATION";
export type OnboardingEventType = "auth.email.verification.requested.v1" | "auth.employee.invitation.requested.v1";
export type OnboardingDeliveryStatus = "PENDING" | "PROCESSING" | "SENT" | "SIMULATED" | "FAILED" | "UNDELIVERABLE";
export interface EncryptedOnboardingContent { iv: string; tag: string; ciphertext: string; }
export interface OnboardingEmailRequestedEvent {
  eventId: string;
  eventType: OnboardingEventType;
  occurredAt: string;
  correlationId: string | null;
  challengeId: string;
  userId: string;
  purpose: OnboardingPurpose;
  generation: number;
  expiresAt: string;
  encrypted: EncryptedOnboardingContent;
}
export interface OnboardingDeliveryRecord {
  id: string;
  challengeId: string;
  userId: string;
  purpose: OnboardingPurpose;
  generation: number;
  expiresAt: string;
  correlationId: string | null;
  attempts: number;
  encrypted: EncryptedOnboardingContent | null;
}
export interface OnboardingAuthorization {
  authorized: true;
  contact: { userId: string; email: string; name: string };
  publicOrigin: string;
  returnPath: string | null;
  expiresAt: string;
}
export interface OnboardingEmailRequest {
  challengeId: string;
  purpose: OnboardingPurpose;
  email: string;
  name: string;
  link: string;
  expiresAt: string;
}
