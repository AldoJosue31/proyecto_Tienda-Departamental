import type { OnModuleDestroy } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import type { DatabaseConfig } from "../config/environment";

export const DATABASE_CONFIG = Symbol("DATABASE_CONFIG");
export type SqlValue = string | number | boolean | Date | readonly string[] | null;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(@Inject(DATABASE_CONFIG) config: DatabaseConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: true } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  query<T extends QueryResultRow>(
    statement: string,
    values: SqlValue[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(statement, values);
  }

  async withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await this.withTransactionOnClient(client, operation);
    } finally {
      client.release();
    }
  }

  async withAdvisoryLock<T>(
    key: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext($1))", [key]);
      return await operation(client);
    } finally {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [key]);
      } finally {
        client.release();
      }
    }
  }

  async withTransactionOnClient<T>(
    client: PoolClient,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    await client.query("BEGIN");
    try {
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
