import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

import { DatabaseService } from "../database/database.service";
import type { AdminUser, AuthUserRecord, PublicUser } from "../auth/auth.types";
import { isRole } from "../config/environment";

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
  role: string;
  is_active: boolean;
  onboarding_status: AuthUserRecord['onboardingStatus'];
  email_verified_at: Date | null;
  auth_version: number;
}

interface PublicUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  auth_version: number;
}

interface AdminUserRow extends PublicUserRow {
  is_active: boolean;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByEmail(email: string): Promise<AuthUserRecord | null> {
    const result = await this.database.query<UserRow>(
      `
        SELECT id, email, name, password_hash, role, is_active, onboarding_status, email_verified_at, auth_version
        FROM auth_users
        WHERE lower(email) = lower($1)
        LIMIT 1
      `,
      [email],
    );
    const row = result.rows[0];
    return row ? this.toAuthUser(row) : null;
  }

  async findActiveById(id: string): Promise<PublicUser | null> {
    const result = await this.database.query<PublicUserRow>(
      `
        SELECT id, email, name, role, auth_version
        FROM auth_users
        WHERE id = $1 AND is_active = TRUE AND onboarding_status = 'READY' AND email_verified_at IS NOT NULL AND password_hash IS NOT NULL
        LIMIT 1
      `,
      [id],
    );
    return this.toPublicUser(result.rows[0]);
  }

  /**
   * Resolves the current active user in the same transaction as refresh-token
   * rotation, preventing a role or active-state change from racing the issue
   * of a replacement access token.
   */
  async findActiveByIdForSession(
    client: PoolClient,
    id: string,
  ): Promise<PublicUser | null> {
    const result = await client.query<PublicUserRow>(
      `
        SELECT id, email, name, role, auth_version
        FROM auth_users
        WHERE id = $1 AND is_active = TRUE AND onboarding_status = 'READY' AND email_verified_at IS NOT NULL AND password_hash IS NOT NULL
        LIMIT 1
        FOR SHARE
      `,
      [id],
    );
    return this.toPublicUser(result.rows[0]);
  }

  async listUsers(): Promise<AdminUser[]> {
    const result = await this.database.query<AdminUserRow>(
      `
        SELECT id, email, name, role, is_active, auth_version
        FROM auth_users
        ORDER BY lower(email) ASC
      `,
    );

    return result.rows.flatMap((row) => isRole(row.role)
      ? [{ id: row.id, email: row.email, name: row.name, role: row.role, isActive: row.is_active }]
      : []);
  }

  private toAuthUser(row: UserRow): AuthUserRecord | null {
    if (!isRole(row.role)) {
      return null;
    }
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      role: row.role,
      isActive: row.is_active,
      onboardingStatus: row.onboarding_status,
      emailVerifiedAt: row.email_verified_at,
      authVersion: row.auth_version,
    };
  }

  private toPublicUser(row: PublicUserRow | undefined): PublicUser | null {
    if (!row || !isRole(row.role)) {
      return null;
    }
    return { id: row.id, email: row.email, name: row.name, role: row.role, authVersion: row.auth_version };
  }
}
