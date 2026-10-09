import { createCipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { ApiException } from '../common/api-exception';
import type { AuthenticatedRequest } from '../common/authenticated-request';

export type ChallengePurpose = 'EMAIL_VERIFICATION' | 'EMPLOYEE_INVITATION';
export const hashValue = (value: string): string => createHash('sha256').update(value).digest('hex');

export function assertNewPassword(password: string): void {
  if (Array.from(password).length < 15 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new ApiException(400, 'INVALID_PASSWORD', 'La contraseña debe tener al menos 15 caracteres y un máximo de 72 bytes UTF-8');
  }
}

export function safeCustomerReturnPath(value?: string): string {
  if (!value || value.length > 512 || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /%(?:2f|5c)/i.test(value) || Array.from(value).some(char => char.charCodeAt(0) < 32)) return '/';
  try {
    const url = new URL(value, 'https://return.invalid');
    if (url.origin !== 'https://return.invalid') return '/';
    const allowed = /^\/(?:account|checkout|orders(?:\/[A-Za-z0-9-]+)?)?$/;
    if (Array.from(url.searchParams.keys()).some(key => /token|password|secret|nonce|csrf/i.test(key))) return '/';
    return allowed.test(url.pathname) ? `${url.pathname}${url.search}` : '/';
  } catch { return '/'; }
}

export function encryptToken(token: string, key: Buffer, challengeId: string, purpose: ChallengePurpose, generation: number) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${challengeId}:${purpose}:${generation}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ token }), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') };
}

export function secureEqual(candidate: string | undefined, expected: Buffer): boolean {
  const actual = Buffer.from(candidate || '', 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function onboardingIp(request: AuthenticatedRequest, key: Buffer, now = Date.now()): string {
  const ip = request.header('x-auth-client-ip');
  const timestamp = request.header('x-auth-client-timestamp');
  const signature = request.header('x-auth-client-signature');
  if (ip && isIP(ip) && timestamp && /^\d{13}$/.test(timestamp) && Math.abs(now - Number(timestamp)) <= 60_000) {
    const expected = createHmac('sha256', key).update(`${timestamp}:${ip}`).digest('hex');
    if (secureEqual(signature, Buffer.from(expected))) return ip;
  }
  return request.ip || request.socket.remoteAddress || 'unknown';
}
