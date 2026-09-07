import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}
  @Get() async health(): Promise<{ status: "ok" }> { try { await this.database.ping(); return { status: "ok" }; } catch { throw new ServiceUnavailableException(); } }
}
