import { Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";

import type { IssuedRefreshToken, SessionMetadata } from "../auth/auth.types";
import { DatabaseService } from "../database/database.service";

export interface StoredRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_token_id: string | null;
}

@Injectable()
export class RefreshTokensRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(
    client: PoolClient,
    userId: string,
    token: IssuedRefreshToken,
    metadata: SessionMetadata,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO auth_refresh_tokens (
          id, user_id, token_hash, family_id, expires_at, user_agent, ip_address
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        token.id,
        userId,
        token.tokenHash,
        token.familyId,
        token.expiresAt,
        metadata.userAgent,
        metadata.ipAddress,
      ],
    );
  }

  async findByHashForUpdate(
    client: PoolClient,
    tokenHash: string,
  ): Promise<StoredRefreshToken | null> {
    const result = await client.query<RefreshTokenRow>(
      `
        SELECT id, user_id, token_hash, family_id, expires_at, revoked_at, replaced_by_token_id
        FROM auth_refresh_tokens
        WHERE token_hash = $1
        FOR UPDATE
      `,
      [tokenHash],
    );
    const row = result.rows[0];
    return row ? this.toStoredToken(row) : null;
  }

  async revokeForReplacement(
    client: PoolClient,
    tokenId: string,
    replacementTokenId: string,
  ): Promise<void> {
    await client.query(
      `
        UPDATE auth_refresh_tokens
        SET revoked_at = NOW(), last_used_at = NOW(), replaced_by_token_id = $2
        WHERE id = $1 AND revoked_at IS NULL
      `,
      [tokenId, replacementTokenId],
    );
  }

  async revokeFamily(client: PoolClient, familyId: string): Promise<void> {
    await client.query(
      `
        UPDATE auth_refresh_tokens
        SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE family_id = $1
      `,
      [familyId],
    );
  }

  async revoke(
    client: PoolClient,
    tokenId: string,
  ): Promise<void> {
    await client.query(
      `
        UPDATE auth_refresh_tokens
        SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE id = $1
      `,
      [tokenId],
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.database.query(
      `
        UPDATE auth_refresh_tokens
        SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE user_id = $1 AND revoked_at IS NULL
      `,
      [userId],
    );
  }

  private toStoredToken(row: RefreshTokenRow): StoredRefreshToken {
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      familyId: row.family_id,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      replacedByTokenId: row.replaced_by_token_id,
    };
  }
}
