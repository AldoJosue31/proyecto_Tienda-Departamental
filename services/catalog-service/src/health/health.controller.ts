import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import { CacheService, type CacheStatus } from "../cache/cache.service";
import { DatabaseService } from "../database/database.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly cache: CacheService,
  ) {}

  @Get()
  async health(): Promise<{
    status: "ok";
    service: "catalog-service";
    timestamp: string;
    cache: CacheStatus;
  }> {
    try {
      await this.database.ping();
    } catch {
      throw new ServiceUnavailableException();
    }
    return {
      status: "ok",
      service: "catalog-service",
      timestamp: new Date().toISOString(),
      cache: this.cache.getStatus(),
    };
  }
}
