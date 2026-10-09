export const ONBOARDING_CONFIG = Symbol('ONBOARDING_CONFIG');

export interface OnboardingConfig {
  publicOrigin: string;
  emailKey: Buffer;
  statusKey: Buffer;
  deliveryKey: Buffer;
  trustedBffIpKey: Buffer;
  rabbitUrl: string;
  verificationTtlSeconds: number;
  invitationTtlSeconds: number;
  resendCooldownSeconds: number;
  resendHourlyLimit: number;
  ipWindowSeconds: number;
  ipLimit: number;
}

function secret(env: NodeJS.ProcessEnv, name: string, exact = false): Buffer {
  const value = env[name]?.trim() || '';
  const decoded = Buffer.from(value, 'base64url');
  if (!/^[A-Za-z0-9_-]+$/.test(value) || (exact ? decoded.length !== 32 : decoded.length < 32)) {
    throw new Error(`${name} must contain a ${exact ? '32-byte' : 'minimum 32-byte'} base64url secret.`);
  }
  return exact ? decoded : Buffer.from(value, 'utf8');
}

function positive(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = env[name] ? Number(env[name]) : fallback;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be positive.`);
  return value;
}

export function loadOnboardingConfig(env: NodeJS.ProcessEnv = process.env): OnboardingConfig {
  const origin = new URL(env.APP_PUBLIC_ORIGIN || '');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' ||
    !(origin.protocol === 'https:' || (origin.protocol === 'http:' && local && env.NODE_ENV !== 'production'))) {
    throw new Error('APP_PUBLIC_ORIGIN must be HTTPS, or localhost HTTP in development.');
  }
  const rabbitUrl = env.RABBITMQ_URL?.trim() || '';
  if (!['amqp:', 'amqps:'].includes(new URL(rabbitUrl).protocol)) throw new Error('RABBITMQ_URL must use AMQP.');
  return {
    publicOrigin: origin.origin,
    emailKey: secret(env, 'ONBOARDING_EMAIL_KEY', true),
    statusKey: secret(env, 'AUTH_STATUS_INTERNAL_SERVICE_KEY'),
    deliveryKey: secret(env, 'AUTH_ONBOARDING_INTERNAL_SERVICE_KEY'),
    trustedBffIpKey: secret(env, 'TRUSTED_BFF_IP_KEY'),
    rabbitUrl,
    verificationTtlSeconds: positive(env, 'AUTH_EMAIL_VERIFICATION_TTL_SECONDS', 3600),
    invitationTtlSeconds: positive(env, 'AUTH_EMPLOYEE_INVITATION_TTL_SECONDS', 86400),
    resendCooldownSeconds: positive(env, 'AUTH_ONBOARDING_RESEND_COOLDOWN_SECONDS', 60),
    resendHourlyLimit: positive(env, 'AUTH_ONBOARDING_RESEND_HOURLY_LIMIT', 3),
    ipWindowSeconds: positive(env, 'AUTH_ONBOARDING_IP_WINDOW_SECONDS', 900),
    ipLimit: positive(env, 'AUTH_ONBOARDING_IP_LIMIT', 10),
  };
}
