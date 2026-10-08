import { Inject, Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { INVENTORY_RUNTIME_CONFIG } from "../auth/token.service";
import type { InventoryRuntimeConfig } from "../config/environment";
import { InventoryService } from "./inventory.service";

@Injectable()
export class ReservationExpiryService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(ReservationExpiryService.name);
  constructor(private readonly inventory: InventoryService, @Inject(INVENTORY_RUNTIME_CONFIG) private readonly config: Pick<InventoryRuntimeConfig, "environment" | "reservationSweepIntervalSeconds">) {}

  onModuleInit(): void {
    if (this.config.environment === "test") return;
    this.timer = setInterval(() => void this.sweep(), this.config.reservationSweepIntervalSeconds * 1000);
    this.timer.unref();
    void this.sweep();
  }

  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try { await this.inventory.expireReservations(); }
    catch { this.logger.warn("Reservation expiry will be retried."); }
    finally { this.running = false; }
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }
}
