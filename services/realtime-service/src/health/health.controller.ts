import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  health(): { status: "ok"; service: "realtime-service"; timestamp: string } {
    return { status: "ok", service: "realtime-service", timestamp: new Date().toISOString() };
  }
}
