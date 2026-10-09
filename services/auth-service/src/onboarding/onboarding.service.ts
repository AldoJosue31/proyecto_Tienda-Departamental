import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';
import { PasswordService } from '../auth/password.service';
import { ApiException } from '../common/api-exception';
import { ONBOARDING_CONFIG, type OnboardingConfig } from './onboarding.config';
import { assertNewPassword, encryptToken, hashValue, safeCustomerReturnPath, type ChallengePurpose } from './onboarding.security';
import type { AcceptInvitationDto, AuthorizeDeliveryDto, ConfirmVerificationDto, EmployeesQueryDto, EmployeeStatusDto, InvitationDto, RegisterDto } from './onboarding.dto';

interface Identity extends QueryResultRow {
  id: string; email: string; name: string; role: string; is_active: boolean;
  onboarding_status: string; auth_version: number; email_verified_at: Date | null;
}
interface Challenge extends QueryResultRow {
  id: string; user_id: string; purpose: ChallengePurpose; generation: number;
  browser_nonce_hash: string | null; return_path: string; expires_at: Date;
  consumed_at: Date | null; revoked_at: Date | null;
}
const GENERIC = { accepted: true, message: 'Si corresponde, recibirás un correo para continuar.' } as const;

@Injectable()
export class OnboardingService {
  constructor(private readonly database: DatabaseService, private readonly passwords: PasswordService,
    @Inject(ONBOARDING_CONFIG) private readonly config: OnboardingConfig) {}

  async register(body: RegisterDto, ip: string, correlationId: string) {
    assertNewPassword(body.password);
    await this.consumeIpLimit(ip);
    const passwordHash = await this.passwords.hash(body.password);
    await this.database.withTransaction(async client => {
      await this.lockEmail(client, body.email);
      const found = await client.query('SELECT id FROM auth_users WHERE lower(email)=$1', [body.email]);
      if (found.rows.length) return;
      const userId = randomUUID();
      await client.query(`INSERT INTO auth_users(id,email,name,password_hash,role,onboarding_status)
        VALUES($1,$2,$3,$4,'CUSTOMER','PENDING_EMAIL')`, [userId, body.email, body.name, passwordHash]);
      await this.recordEmailSend(client, body.email, false);
      await this.createChallenge(client, userId, 'EMAIL_VERIFICATION', hashValue(body.browserNonce), safeCustomerReturnPath(body.returnPath), correlationId);
      await this.audit(client, null, userId, 'CUSTOMER_REGISTERED', correlationId);
    });
    return GENERIC;
  }

  async resendVerification(email: string, ip: string, correlationId: string) {
    await this.consumeIpLimit(ip);
    await this.database.withTransaction(async client => {
      await this.lockEmail(client, email);
      const result = await client.query<Identity>('SELECT * FROM auth_users WHERE lower(email)=$1 FOR UPDATE', [email]);
      const user = result.rows[0];
      if (!user || user.role !== 'CUSTOMER' || !user.is_active || user.onboarding_status !== 'PENDING_EMAIL') return;
      // Public responses remain identical if an address is cooling down or unknown.
      if (!await this.recordEmailSend(client, email, true)) return;
      const prior = await client.query<Challenge>('SELECT * FROM auth_onboarding_challenges WHERE user_id=$1 AND purpose=$2 ORDER BY generation DESC LIMIT 1', [user.id, 'EMAIL_VERIFICATION']);
      await this.createChallenge(client, user.id, 'EMAIL_VERIFICATION', prior.rows[0]?.browser_nonce_hash || null, prior.rows[0]?.return_path || '/', correlationId);
      await this.audit(client, null, user.id, 'EMAIL_VERIFICATION_RESENT', correlationId);
    });
    return GENERIC;
  }

  async confirmVerification(body: ConfirmVerificationDto, ip: string, correlationId: string) {
    await this.consumeIpLimit(ip);
    if (body.password !== undefined) assertNewPassword(body.password);
    const replacementHash = body.password !== undefined ? await this.passwords.hash(body.password) : null;
    return this.database.withTransaction(async client => {
      const { user, challenge } = await this.lockValidChallenge(client, body.token, 'EMAIL_VERIFICATION');
      const sameBrowser = body.browserNonce && challenge.browser_nonce_hash === hashValue(body.browserNonce);
      if (!sameBrowser && !replacementHash) {
        throw new ApiException(409, 'PASSWORD_CONFIRMATION_REQUIRED', 'Establece una contraseña para confirmar el registro desde este navegador');
      }
      await client.query(`UPDATE auth_users SET onboarding_status='READY',email_verified_at=NOW(),verification_source='EMAIL_CHALLENGE',
        password_hash=COALESCE($2,password_hash) WHERE id=$1`, [user.id, replacementHash]);
      await this.consumeChallenge(client, challenge.id);
      await this.audit(client, null, user.id, 'EMAIL_VERIFIED', correlationId);
      return { success: true as const, returnPath: safeCustomerReturnPath(challenge.return_path) };
    });
  }

  async inviteEmployee(actorId: string, body: InvitationDto, key: string | undefined, correlationId: string) {
    if (!key || !/^[A-Za-z0-9_.:-]{8,128}$/.test(key)) throw new ApiException(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Se requiere una Idempotency-Key de 8 a 128 caracteres');
    const requestHash = hashValue(JSON.stringify([body.name, body.email]));
    return this.database.withTransaction(async client => {
      await this.requireAdmin(client, actorId);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`invitation:${actorId}:${key}`]);
      const prior = await client.query<{ request_hash: string; response: { accepted: true; employee: Record<string, unknown> } }>(
        'SELECT request_hash,response FROM auth_employee_invitation_requests WHERE actor_id=$1 AND idempotency_key=$2', [actorId, key]);
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== requestHash) throw new ApiException(409, 'IDEMPOTENCY_CONFLICT', 'La clave ya fue utilizada para otra invitación');
        return prior.rows[0].response;
      }
      await this.lockEmail(client, body.email);
      const existing = await client.query('SELECT id FROM auth_users WHERE lower(email)=$1', [body.email]);
      if (existing.rows.length) throw new ApiException(409, 'EMAIL_ALREADY_USED', 'El correo ya pertenece a una cuenta. No se cambiará su rol');
      const userId = randomUUID();
      await client.query(`INSERT INTO auth_users(id,email,name,password_hash,role,onboarding_status,created_by)
        VALUES($1,$2,$3,NULL,'EMPLOYEE','PENDING_INVITATION',$4)`, [userId, body.email, body.name, actorId]);
      await this.recordEmailSend(client, body.email, false);
      await this.createChallenge(client, userId, 'EMPLOYEE_INVITATION', null, '/', correlationId);
      await this.audit(client, actorId, userId, 'EMPLOYEE_INVITED', correlationId);
      const response = { accepted: true as const, employee: { id: userId, email: body.email, name: body.name, role: 'EMPLOYEE', onboardingStatus: 'PENDING_INVITATION', isActive: true, authVersion: 0 } };
      await client.query(`INSERT INTO auth_employee_invitation_requests(actor_id,idempotency_key,request_hash,response)
        VALUES($1,$2,$3,$4::jsonb)`, [actorId, key, requestHash, JSON.stringify(response)]);
      return response;
    });
  }

  async resendEmployee(actorId: string, userId: string, correlationId: string) {
    return this.database.withTransaction(async client => {
      await this.requireAdmin(client, actorId);
      const contact = await client.query<{ email: string }>('SELECT email FROM auth_users WHERE id=$1 AND role=$2', [userId, 'EMPLOYEE']);
      if (!contact.rows[0]) throw new ApiException(404, 'EMPLOYEE_NOT_FOUND', 'Empleado no encontrado');
      // Public resend locks email first. Keep the same order for an employee address.
      await this.lockEmail(client, contact.rows[0].email);
      const user = await this.lockEmployee(client, userId);
      if (!user.is_active || user.onboarding_status !== 'PENDING_INVITATION') throw new ApiException(409, 'INVITATION_NOT_PENDING', 'El empleado debe estar habilitado y pendiente de invitación');
      if (!await this.recordEmailSend(client, user.email, true)) throw new ApiException(429, 'RESEND_LIMIT', 'Espera antes de reenviar la invitación');
      await this.createChallenge(client, user.id, 'EMPLOYEE_INVITATION', null, '/', correlationId);
      await this.audit(client, actorId, user.id, 'EMPLOYEE_INVITATION_RESENT', correlationId);
      return { accepted: true as const };
    });
  }

  async acceptEmployee(body: AcceptInvitationDto, ip: string, correlationId: string) {
    assertNewPassword(body.password);
    await this.consumeIpLimit(ip);
    const passwordHash = await this.passwords.hash(body.password);
    return this.database.withTransaction(async client => {
      const { user, challenge } = await this.lockValidChallenge(client, body.token, 'EMPLOYEE_INVITATION');
      await client.query(`UPDATE auth_users SET password_hash=$2,onboarding_status='READY',email_verified_at=NOW(),verification_source='EMPLOYEE_INVITATION' WHERE id=$1`, [user.id, passwordHash]);
      await this.consumeChallenge(client, challenge.id);
      await this.audit(client, null, user.id, 'EMPLOYEE_INVITATION_ACCEPTED', correlationId);
      return { success: true as const, returnPath: '/' };
    });
  }

  async setEmployeeStatus(actorId: string, userId: string, body: EmployeeStatusDto, correlationId: string) {
    return this.database.withTransaction(async client => {
      await this.requireAdmin(client, actorId);
      const user = await this.lockEmployee(client, userId);
      if (user.auth_version !== body.authVersion) throw new ApiException(409, 'AUTH_VERSION_CONFLICT', 'El empleado cambió. Actualiza su información antes de continuar');
      if (user.is_active !== body.isActive) {
        await client.query('UPDATE auth_users SET is_active=$2,auth_version=auth_version+1 WHERE id=$1', [userId, body.isActive]);
        await client.query('UPDATE auth_refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=$1', [userId]);
        await client.query('UPDATE auth_onboarding_challenges SET revoked_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL', [userId]);
        await client.query(`UPDATE auth_onboarding_outbox SET payload=payload-'encrypted',published_at=COALESCE(published_at,NOW()) WHERE challenge_id IN (SELECT id FROM auth_onboarding_challenges WHERE user_id=$1)`, [userId]);
        await this.audit(client, actorId, userId, body.isActive ? 'EMPLOYEE_ENABLED' : 'EMPLOYEE_DISABLED', correlationId);
      }
      return { employee: { id: user.id, email: user.email, name: user.name, role: 'EMPLOYEE', onboardingStatus: user.onboarding_status, isActive: body.isActive, authVersion: user.auth_version + Number(user.is_active !== body.isActive) } };
    });
  }

  async listEmployees(query: EmployeesQueryDto) {
    const search = `%${(query.search || '').trim().replace(/[\\%_]/g, '\\$&')}%`;
    const result = await this.database.query<Identity & { delivery_status: string | null; delivery_attempt: number | null; count: string }>(`
      SELECT u.*,c.delivery_status,c.delivery_attempt,COUNT(*) OVER()::text AS count
      FROM auth_users u LEFT JOIN LATERAL (
        SELECT delivery_status,delivery_attempt FROM auth_onboarding_challenges WHERE user_id=u.id AND purpose='EMPLOYEE_INVITATION' ORDER BY generation DESC LIMIT 1
      ) c ON TRUE WHERE u.role='EMPLOYEE' AND (u.email ILIKE $1 OR u.name ILIKE $1)
      ORDER BY lower(u.email),u.id LIMIT $2 OFFSET $3`, [search, query.pageSize, (query.page - 1) * query.pageSize]);
    let total = Number(result.rows[0]?.count || 0);
    if (!result.rows.length && query.page > 1) {
      const count = await this.database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM auth_users WHERE role=$1 AND (email ILIKE $2 OR name ILIKE $2)', ['EMPLOYEE', search]);
      total = Number(count.rows[0]?.count || 0);
    }
    return { employees: result.rows.map(user => ({ id: user.id, email: user.email, name: user.name, role: user.role, isActive: user.is_active, onboardingStatus: user.onboarding_status, authVersion: user.auth_version, emailVerifiedAt: user.email_verified_at, deliveryStatus: user.delivery_status, deliveryAttempt: user.delivery_attempt })), pagination: { page: query.page, pageSize: query.pageSize, total } };
  }

  async identityStatus(userId: string) {
    const result = await this.database.query<Identity>('SELECT id,role,is_active,onboarding_status,email_verified_at,auth_version FROM auth_users WHERE id=$1', [userId]);
    const user = result.rows[0];
    if (!user) throw new ApiException(404, 'USER_NOT_FOUND', 'Identidad no disponible');
    return { user: { id: user.id, role: user.role, isActive: user.is_active && user.onboarding_status === 'READY' && !!user.email_verified_at, authVersion: user.auth_version } };
  }

  async authorizeDelivery(body: AuthorizeDeliveryDto) {
    const result = await this.database.query<Challenge & { email: string; name: string }>(`
      SELECT c.*,u.email,u.name FROM auth_onboarding_challenges c JOIN auth_users u ON u.id=c.user_id
      WHERE c.id=$1 AND c.user_id=$2 AND c.purpose=$3 AND c.generation=$4
      AND c.consumed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at>NOW() AND u.is_active=TRUE
      AND ((c.purpose='EMAIL_VERIFICATION' AND u.role='CUSTOMER' AND u.onboarding_status='PENDING_EMAIL')
        OR (c.purpose='EMPLOYEE_INVITATION' AND u.role='EMPLOYEE' AND u.onboarding_status='PENDING_INVITATION'))`, [body.challengeId, body.userId, body.purpose, body.generation]);
    const row = result.rows[0];
    return row ? { authorized: true as const, contact: { userId: row.user_id, email: row.email, name: row.name }, publicOrigin: this.config.publicOrigin, returnPath: row.return_path, expiresAt: row.expires_at.toISOString() } : { authorized: false as const };
  }

  private async requireAdmin(client: PoolClient, actorId: string): Promise<void> {
    const found = await client.query('SELECT id FROM auth_users WHERE id=$1 AND role=$2 AND is_active=TRUE AND onboarding_status=$3 AND email_verified_at IS NOT NULL FOR SHARE', [actorId, 'ADMIN', 'READY']);
    if (!found.rows.length) throw new ApiException(403, 'FORBIDDEN', 'Se requiere una cuenta administrativa habilitada');
  }

  private async lockEmployee(client: PoolClient, userId: string): Promise<Identity> {
    const found = await client.query<Identity>('SELECT * FROM auth_users WHERE id=$1 AND role=$2 FOR UPDATE', [userId, 'EMPLOYEE']);
    if (!found.rows[0]) throw new ApiException(404, 'EMPLOYEE_NOT_FOUND', 'Empleado no encontrado');
    return found.rows[0];
  }

  private async lockEmail(client: PoolClient, email: string) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`email:${email}`]);
  }

  private async consumeIpLimit(ip: string) {
    const bucket = new Date(Math.floor(Date.now() / (this.config.ipWindowSeconds * 1000)) * this.config.ipWindowSeconds * 1000);
    const result = await this.database.query<{ attempts: number }>(`INSERT INTO auth_onboarding_rate_limits(scope,subject_hash,bucket_start,attempts)
      VALUES('IP',$1,$2,1) ON CONFLICT(scope,subject_hash,bucket_start) DO UPDATE SET attempts=auth_onboarding_rate_limits.attempts+1 RETURNING attempts`, [hashValue(ip), bucket]);
    if ((result.rows[0]?.attempts || 0) > this.config.ipLimit) throw new ApiException(429, 'ONBOARDING_RATE_LIMIT', 'Demasiadas solicitudes. Intenta de nuevo más tarde');
  }

  private async recordEmailSend(client: PoolClient, email: string, resend: boolean): Promise<boolean> {
    const subject = hashValue(email);
    const previous = await client.query<{ last_sent_at: Date }>('SELECT last_sent_at FROM auth_onboarding_email_limits WHERE email_hash=$1 FOR UPDATE', [subject]);
    if (previous.rows[0] && Date.now() - previous.rows[0].last_sent_at.getTime() < this.config.resendCooldownSeconds * 1000) return false;
    if (resend) {
      const bucket = new Date();
      const count = await client.query<{ attempts: number }>(`SELECT COALESCE(SUM(attempts),0)::integer AS attempts FROM auth_onboarding_rate_limits WHERE scope='EMAIL_RESEND' AND subject_hash=$1 AND bucket_start>NOW()-INTERVAL '1 hour'`, [subject]);
      if ((count.rows[0]?.attempts || 0) >= this.config.resendHourlyLimit) return false;
      await client.query(`INSERT INTO auth_onboarding_rate_limits(scope,subject_hash,bucket_start,attempts) VALUES('EMAIL_RESEND',$1,$2,1)
        ON CONFLICT(scope,subject_hash,bucket_start) DO UPDATE SET attempts=auth_onboarding_rate_limits.attempts+1`, [subject, bucket]);
    }
    await client.query(`INSERT INTO auth_onboarding_email_limits(email_hash,last_sent_at) VALUES($1,NOW()) ON CONFLICT(email_hash) DO UPDATE SET last_sent_at=NOW()`, [subject]);
    return true;
  }

  private async createChallenge(client: PoolClient, userId: string, purpose: ChallengePurpose, browserNonceHash: string | null, returnPath: string, correlationId: string) {
    const generationResult = await client.query<{ generation: number }>('SELECT COALESCE(MAX(generation),0)+1 AS generation FROM auth_onboarding_challenges WHERE user_id=$1 AND purpose=$2', [userId, purpose]);
    const generation = generationResult.rows[0]!.generation;
    await client.query('UPDATE auth_onboarding_challenges SET revoked_at=NOW() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL AND revoked_at IS NULL', [userId, purpose]);
    await client.query(`UPDATE auth_onboarding_outbox SET payload=payload-'encrypted',published_at=COALESCE(published_at,NOW()) WHERE challenge_id IN (SELECT id FROM auth_onboarding_challenges WHERE user_id=$1 AND purpose=$2 AND revoked_at IS NOT NULL)`, [userId, purpose]);
    const challengeId = randomUUID(), eventId = randomUUID(), token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + (purpose === 'EMAIL_VERIFICATION' ? this.config.verificationTtlSeconds : this.config.invitationTtlSeconds) * 1000);
    await client.query(`INSERT INTO auth_onboarding_challenges(id,user_id,purpose,generation,token_hash,browser_nonce_hash,return_path,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [challengeId, userId, purpose, generation, hashValue(token), browserNonceHash, returnPath, expiresAt]);
    const eventType = purpose === 'EMAIL_VERIFICATION' ? 'auth.email.verification.requested.v1' : 'auth.employee.invitation.requested.v1';
    const event = { eventId, eventType, occurredAt: new Date().toISOString(), correlationId, challengeId, userId, purpose, generation, expiresAt: expiresAt.toISOString(), encrypted: encryptToken(token, this.config.emailKey, challengeId, purpose, generation) };
    await client.query('INSERT INTO auth_onboarding_outbox(event_id,challenge_id,routing_key,payload) VALUES($1,$2,$3,$4::jsonb)', [eventId, challengeId, eventType, JSON.stringify(event)]);
  }

  private async lockValidChallenge(client: PoolClient, token: string, purpose: ChallengePurpose) {
    const candidate = await client.query<{ user_id: string }>('SELECT user_id FROM auth_onboarding_challenges WHERE token_hash=$1 AND purpose=$2', [hashValue(token), purpose]);
    const userId = candidate.rows[0]?.user_id;
    if (!userId) throw this.invalidChallenge();
    const users = await client.query<Identity>('SELECT * FROM auth_users WHERE id=$1 FOR UPDATE', [userId]);
    const user = users.rows[0];
    const challenges = await client.query<Challenge>('SELECT * FROM auth_onboarding_challenges WHERE token_hash=$1 AND purpose=$2 FOR UPDATE', [hashValue(token), purpose]);
    const challenge = challenges.rows[0];
    const expectedRole = purpose === 'EMAIL_VERIFICATION' ? 'CUSTOMER' : 'EMPLOYEE';
    const expectedStatus = purpose === 'EMAIL_VERIFICATION' ? 'PENDING_EMAIL' : 'PENDING_INVITATION';
    if (!user || !user.is_active || user.role !== expectedRole || user.onboarding_status !== expectedStatus || !challenge || challenge.consumed_at || challenge.revoked_at || challenge.expires_at.getTime() <= Date.now()) throw this.invalidChallenge();
    return { user, challenge };
  }

  private invalidChallenge() { return new ApiException(400, 'INVALID_ONBOARDING_TOKEN', 'El enlace no es válido, venció o ya fue utilizado'); }
  private async consumeChallenge(client: PoolClient, challengeId: string) {
    await client.query('UPDATE auth_onboarding_challenges SET consumed_at=NOW() WHERE id=$1', [challengeId]);
    await client.query(`UPDATE auth_onboarding_outbox SET payload=payload-'encrypted',published_at=COALESCE(published_at,NOW()) WHERE challenge_id=$1`, [challengeId]);
  }
  private async audit(client: PoolClient, actorId: string | null, userId: string, action: string, correlationId: string) {
    await client.query('INSERT INTO auth_onboarding_audit(actor_id,user_id,action,correlation_id) VALUES($1,$2,$3,$4)', [actorId, userId, action, correlationId]);
  }
}
