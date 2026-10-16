import { describe, expect, it } from 'vitest';
import { createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { assertNewPassword, encryptToken, onboardingIp, safeCustomerReturnPath } from '../src/onboarding/onboarding.security';
import { RegisterDto, EmployeeStatusDto } from '../src/onboarding/onboarding.dto';
import { loadOnboardingConfig } from '../src/onboarding/onboarding.config';
import type { AuthenticatedRequest } from '../src/common/authenticated-request';
import { parseDeliveryOutcome } from '../src/onboarding/onboarding-events.service';

describe('Onboarding security contracts', () => {
  it('allows long phrases but refuses bcrypt truncation in UTF-8', () => {
    expect(() => assertNewPassword('una frase fácil de recordar')).not.toThrow();
    expect(() => assertNewPassword('short-password')).toThrow();
    expect(() => assertNewPassword('ñ'.repeat(37))).toThrow();
    expect(() => assertNewPassword('ñ'.repeat(36))).not.toThrow();
  });
  it('rejects public role escalation and injected internal identity fields', async () => {
    const dto = plainToInstance(RegisterDto, { name: 'Cliente', email: ' USER@Example.test ', password: 'una contraseña extensa', browserNonce: randomBytes(32).toString('base64url'), role: 'ADMIN', isActive: true });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(dto.email).toBe('user@example.test');
    expect(errors.map(error => error.property)).toEqual(expect.arrayContaining(['role', 'isActive']));
  });
  it('requires a boolean and integer version for status changes', async () => {
    expect(await validate(plainToInstance(EmployeeStatusDto, { isActive: 'false', authVersion: -1 }))).toHaveLength(2);
  });
  it('allows customer return paths while blocking external and administrative destinations', () => {
    expect(safeCustomerReturnPath('/checkout?step=payment')).toBe('/checkout?step=payment');
    for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/inventory', '/users', '/%2f%2fevil.test', '/shop\nX:attack', '/checkout?token=secret', '/checkout?' + 'x'.repeat(513)]) {
      expect(safeCustomerReturnPath(value)).toBe('/');
    }
  });
  it('encrypts tokens with a purpose- and generation-bound authenticated envelope', () => {
    const key = randomBytes(32), token = randomBytes(32).toString('base64url');
    const encrypted = encryptToken(token, key, 'challenge-id', 'EMAIL_VERIFICATION', 2);
    expect(JSON.stringify(encrypted)).not.toContain(token);
    const decrypt = (generation: number) => {
      const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64url'));
      cipher.setAAD(Buffer.from(`challenge-id:EMAIL_VERIFICATION:${generation}`));
      cipher.setAuthTag(Buffer.from(encrypted.tag, 'base64url'));
      return Buffer.concat([cipher.update(Buffer.from(encrypted.ciphertext, 'base64url')), cipher.final()]).toString();
    };
    expect(JSON.parse(decrypt(2))).toEqual({ token });
    expect(() => decrypt(1)).toThrow();
  });
  it('trusts a fresh signed BFF IP and ignores spoofed, expired and XFF-only headers', () => {
    const key = randomBytes(32), now = Date.now(), ip = '203.0.113.10';
    const headers: Record<string, string> = { 'x-auth-client-ip': ip, 'x-auth-client-timestamp': String(now), 'x-auth-client-signature': createHmac('sha256', key).update(`${now}:${ip}`).digest('hex'), 'x-forwarded-for': '198.51.100.1' };
    const request = { header: (name: string) => headers[name], ip: '172.0.0.4', socket: { remoteAddress: '172.0.0.4' } } as unknown as AuthenticatedRequest;
    expect(onboardingIp(request, key, now)).toBe(ip);
    expect(onboardingIp(request, key, now + 61_000)).toBe('172.0.0.4');
    headers['x-auth-client-signature'] = 'fake';
    expect(onboardingIp(request, key, now)).toBe('172.0.0.4');
  });
  it('requires public HTTPS and a dedicated AES-256 key', () => {
    const secret = randomBytes(32).toString('base64url');
    const env = { APP_PUBLIC_ORIGIN: 'http://localhost:3105', NODE_ENV: 'development', ONBOARDING_EMAIL_KEY: secret, AUTH_STATUS_INTERNAL_SERVICE_KEY: secret, AUTH_ONBOARDING_INTERNAL_SERVICE_KEY: secret, TRUSTED_BFF_IP_KEY: secret, RABBITMQ_URL: 'amqp://localhost' };
    expect(loadOnboardingConfig(env).verificationTtlSeconds).toBe(3600);
    expect(() => loadOnboardingConfig({ ...env, NODE_ENV: 'production' })).toThrow();
    expect(() => loadOnboardingConfig({ ...env, ONBOARDING_EMAIL_KEY: randomBytes(33).toString('base64url') })).toThrow();
    expect(() => loadOnboardingConfig({ ...env, APP_PUBLIC_ORIGIN: 'https://shop.test/path' })).toThrow();
  });
  it('rejects delivery result events outside the onboarding contract', () => {
    const event = { eventId: '43a69d8b-14df-4618-9a53-4111e9fe0e85', eventType: 'auth.email.delivery.updated.v1', challengeId: 'ffd03fdf-a2b2-40bc-800f-a503248aaef8', userId: '0d459bd6-6d10-45eb-8f24-74c9c498665f', purpose: 'EMAIL_VERIFICATION', generation: 1, status: 'SIMULATED', attempt: 1, willRetry: false };
    expect(parseDeliveryOutcome(event)?.status).toBe('SIMULATED');
    expect(parseDeliveryOutcome({ ...event, attempt: -1 })).toBeNull();
    expect(parseDeliveryOutcome({ ...event, eventType: 'notification.coupon.delivery.updated.v1' })).toBeNull();
  });
});
