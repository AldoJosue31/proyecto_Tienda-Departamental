import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Inject, Injectable, Logger } from "@nestjs/common";
import Redis from "ioredis";

import type { CacheConfig } from "../config/environment";

export const CACHE_CONFIG = Symbol("CACHE_CONFIG");

export type CacheStatus = "ready" | "degraded" | "disabled";

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: Redis | null = null;
  private status: CacheStatus = "disabled";

  constructor(@Inject(CACHE_CONFIG) private readonly config: CacheConfig) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.redisUrl) {
      this.status = "disabled";
      return;
    }

    const client = new Redis(this.config.redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_000,
      retryStrategy: () => null,
    });
    client.on("error", () => this.markDegraded());

    try {
      await client.connect();
      this.client = client;
      this.status = "ready";
    } catch {
      client.disconnect();
      this.status = "degraded";
      this.logger.warn("Redis cache is unavailable; PostgreSQL fallback is active.");
    }
  }

  getStatus(): CacheStatus {
    return this.status;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.run(() => this.client?.get(key));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      await this.delete(key);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.run(() => this.client?.set(key, JSON.stringify(value), "EX", ttlSeconds));
  }

  async getString(key: string): Promise<string | null> {
    return this.run(() => this.client?.get(key));
  }

  async setString(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.run(() => this.client?.set(key, value, "EX", ttlSeconds));
  }

  async delete(key: string): Promise<void> {
    await this.run(() => this.client?.del(key));
  }

  async onModuleDestroy(): Promise<void> {
    this.client?.disconnect();
    this.client = null;
  }

  private async run<T>(operation: () => Promise<T | undefined> | undefined): Promise<T | null> {
    if (!this.client || this.status !== "ready") {
      return null;
    }
    try {
      const result = await operation();
      return result ?? null;
    } catch {
      this.markDegraded();
      return null;
    }
  }

  private markDegraded(): void {
    if (this.status === "ready") {
      this.status = "degraded";
      this.logger.warn("Redis cache degraded; PostgreSQL fallback is active.");
    }
  }
}
