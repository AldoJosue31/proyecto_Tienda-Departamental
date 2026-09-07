import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async health(): Promise<{
    status: "ok";
    service: "inventory-service";
    timestamp: string;
  }> {
    try {
      await this.database.ping();
    } catch {
      throw new ServiceUnavailableException();
    }
    return {
      status: "ok",
      service: "inventory-service",
      timestamp: new Date().toISOString(),
    };
  }
}
