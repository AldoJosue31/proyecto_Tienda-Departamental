import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';
import { OnboardingService } from '../src/onboarding/onboarding.service';
import type { DatabaseService } from '../src/database/database.service';
import type { PasswordService } from '../src/auth/password.service';
import type { OnboardingConfig } from '../src/onboarding/onboarding.config';
import { hashValue } from '../src/onboarding/onboarding.security';

const userId = '0d459bd6-6d10-45eb-8f24-74c9c498665f';
const actorId = 'a62ea63b-e1e3-4ee7-8a78-a757f67cbb18';
const challengeId = 'ffd03fdf-a2b2-40bc-800f-a503248aaef8';
const token = randomBytes(32).toString('base64url');
const browserNonce = randomBytes(32).toString('base64url');
const config: OnboardingConfig = {
  publicOrigin: 'http://localhost:3105', emailKey: randomBytes(32), statusKey: randomBytes(32), deliveryKey: randomBytes(32), trustedBffIpKey: randomBytes(32), rabbitUrl: 'amqp://localhost', verificationTtlSeconds: 3600, invitationTtlSeconds: 86400, resendCooldownSeconds: 60, resendHourlyLimit: 3, ipWindowSeconds: 900, ipLimit: 10,
};
const pendingCustomer = { id: userId, email: 'new@example.test', name: 'Cliente', role: 'CUSTOMER', is_active: true, onboarding_status: 'PENDING_EMAIL', auth_version: 0, email_verified_at: null };
const challenge = { id: challengeId, user_id: userId, purpose: 'EMAIL_VERIFICATION', generation: 1, browser_nonce_hash: hashValue(browserNonce), return_path: '/checkout', expires_at: new Date(Date.now() + 60_000), consumed_at: null, revoked_at: null };

function setup(resolve: (sql: string, args?: unknown[]) => unknown[]) {
  const query = vi.fn(async (sql: string, args?: unknown[]) => ({ rows: resolve(sql, args), rowCount: 1 }));
  const client = { query } as unknown as PoolClient;
  const database = {
    query: vi.fn(async () => ({ rows: [{ attempts: 1 }], rowCount: 1 })),
    withTransaction: vi.fn(async (operation: (client: PoolClient) => Promise<unknown>) => operation(client)),
  } as unknown as DatabaseService;
  const passwords = { hash: vi.fn(async () => 'new-safe-password-hash') } as unknown as PasswordService;
  return { service: new OnboardingService(database, passwords, config), query, database, passwords };
}

describe('Onboarding transactional behavior', () => {
  it('returns the same generic response for duplicate mail without changing its identity or credentials', async () => {
    const { service, query } = setup(sql => sql.includes('SELECT id FROM auth_users WHERE lower(email)') ? [{ id: userId }] : []);
    await expect(service.register({ name: 'Otra persona', email: pendingCustomer.email, password: 'un intento diferente', browserNonce, returnPath: '/users' }, '203.0.113.1', 'test')).resolves.toEqual({ accepted: true, message: 'Si corresponde, recibirás un correo para continuar.' });
    expect(query.mock.calls.some(([sql]) => /(?:UPDATE|INSERT INTO) auth_users/.test(sql))).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.includes('auth_onboarding_challenges'))).toBe(false);
  });

  it('refuses activation in another browser until that recipient chooses a fresh password', async () => {
    const { service, query, database } = setup(sql => {
      if (sql.startsWith('SELECT user_id FROM')) return [{ user_id: userId }];
      if (sql.startsWith('SELECT * FROM auth_users')) return [pendingCustomer];
      if (sql.startsWith('SELECT * FROM auth_onboarding_challenges')) return [challenge];
      return [];
    });
    await expect(service.confirmVerification({ token, browserNonce: randomBytes(32).toString('base64url') }, '203.0.113.1', 'test')).rejects.toMatchObject({ code: 'PASSWORD_CONFIRMATION_REQUIRED' });
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    // The limit persists independently of the rejected token transaction.
    expect(database.query).toHaveBeenCalledOnce();
  });

  it('replaces the unconfirmed password from another browser and consumes only the valid challenge', async () => {
    const { service, query } = setup(sql => {
      if (sql.startsWith('SELECT user_id FROM')) return [{ user_id: userId }];
      if (sql.startsWith('SELECT * FROM auth_users')) return [pendingCustomer];
      if (sql.startsWith('SELECT * FROM auth_onboarding_challenges')) return [challenge];
      return [];
    });
    await expect(service.confirmVerification({ token, password: 'la frase elegida por destinatario' }, '203.0.113.1', 'test')).resolves.toEqual({ success: true, returnPath: '/checkout' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("onboarding_status='READY'"), [userId, 'new-safe-password-hash']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SET consumed_at=NOW()'), [challengeId]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("payload=payload-'encrypted'"), [challengeId]);
  });

  it('rejects a consumed or expired link before modifying the account', async () => {
    for (const invalid of [{ ...challenge, consumed_at: new Date() }, { ...challenge, expires_at: new Date(Date.now() - 1000) }]) {
      const { service, query } = setup(sql => {
        if (sql.startsWith('SELECT user_id FROM')) return [{ user_id: userId }];
        if (sql.startsWith('SELECT * FROM auth_users')) return [pendingCustomer];
        if (sql.startsWith('SELECT * FROM auth_onboarding_challenges')) return [invalid];
        return [];
      });
      await expect(service.confirmVerification({ token, browserNonce }, '203.0.113.1', 'test')).rejects.toMatchObject({ code: 'INVALID_ONBOARDING_TOKEN' });
      expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    }
  });

  it('invalidates access version, all refresh sessions and all pending invitations together on disable', async () => {
    const { service, query } = setup(sql => {
      if (sql.startsWith('SELECT id FROM auth_users')) return [{ id: actorId }];
      if (sql.startsWith('SELECT * FROM auth_users')) return [{ ...pendingCustomer, role: 'EMPLOYEE', onboarding_status: 'PENDING_INVITATION', auth_version: 4 }];
      return [];
    });
    const result = await service.setEmployeeStatus(actorId, userId, { isActive: false, authVersion: 4 }, 'test');
    expect(result.employee).toMatchObject({ isActive: false, authVersion: 5 });
    for (const table of ['auth_users', 'auth_refresh_tokens', 'auth_onboarding_challenges', 'auth_onboarding_outbox']) {
      expect(query.mock.calls.some(([sql]) => sql.startsWith(`UPDATE ${table}`))).toBe(true);
    }
  });

  it('rejects stale administrative versions without revoking a newer session', async () => {
    const { service, query } = setup(sql => {
      if (sql.startsWith('SELECT id FROM auth_users')) return [{ id: actorId }];
      if (sql.startsWith('SELECT * FROM auth_users')) return [{ ...pendingCustomer, role: 'EMPLOYEE', auth_version: 5 }];
      return [];
    });
    await expect(service.setEmployeeStatus(actorId, userId, { isActive: false, authVersion: 4 }, 'test')).rejects.toMatchObject({ code: 'AUTH_VERSION_CONFLICT' });
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  it('returns the prior employee invitation on an identical idempotent retry', async () => {
    const body = { email: 'employee@example.test', name: 'Empleado' };
    const response = { accepted: true, employee: { id: userId } };
    const { service, query } = setup(sql => {
      if (sql.startsWith('SELECT id FROM auth_users')) return [{ id: actorId }];
      if (sql.startsWith('SELECT request_hash,response')) return [{ request_hash: hashValue(JSON.stringify([body.name, body.email])), response }];
      return [];
    });
    await expect(service.inviteEmployee(actorId, body, 'invitation-123', 'test')).resolves.toEqual(response);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
    await expect(service.inviteEmployee(actorId, { ...body, name: 'Otro' }, 'invitation-123', 'test')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('reports pending identities as inactive for downstream session authorization', async () => {
    const { service, database } = setup(() => []);
    vi.mocked(database.query).mockResolvedValue({ rows: [pendingCustomer], rowCount: 1, command: 'SELECT', oid: 0, fields: [] });
    await expect(service.identityStatus(userId)).resolves.toMatchObject({ user: { role: 'CUSTOMER', isActive: false, authVersion: 0 } });
  });
});
