import { Inject, Injectable } from "@nestjs/common";

import { ORDERS_RUNTIME_CONFIG } from "../auth/token.service";
import { ApiException } from "../common/api-exception";
import type { OrdersRuntimeConfig } from "../config/environment";

export type LogisticsCancellationResult = "CANCELLED" | "NOT_PROJECTED";

@Injectable()
export class LogisticsClient {
  constructor(
    @Inject(ORDERS_RUNTIME_CONFIG)
    private readonly config: Pick<
      OrdersRuntimeConfig,
      "logisticsServiceUrl" | "logisticsInternalServiceKey" | "upstreamTimeoutMilliseconds"
    >,
  ) {}

  async cancelBeforeDispatch(orderId: string, correlationId: string | null): Promise<LogisticsCancellationResult> {
    let response: Response;
    try {
      response = await fetch(
        new URL("/internal/shipments/orders/" + encodeURIComponent(orderId) + "/cancel", this.config.logisticsServiceUrl),
        {
          method: "POST",
          headers: this.headers(correlationId),
          signal: AbortSignal.timeout(this.config.upstreamTimeoutMilliseconds),
        },
      );
    } catch {
      throw new ApiException(503, "LOGISTICS_UNAVAILABLE", "No pudimos validar el estado de entrega. Intenta cancelar nuevamente.");
    }

    const payload: unknown = await response.json().catch(() => null);
    if (response.status === 409 && this.object(payload) && payload.code === "ORDER_ALREADY_DISPATCHED") {
      throw new ApiException(409, "ORDER_ALREADY_DISPATCHED", "El pedido ya fue despachado y no puede cancelarse.");
    }
    if (!response.ok) {
      throw new ApiException(503, "LOGISTICS_UNAVAILABLE", "No pudimos validar el estado de entrega. Intenta cancelar nuevamente.");
    }
    if (!this.object(payload) || (payload.result !== "CANCELLED" && payload.result !== "NOT_PROJECTED")) {
      throw new ApiException(503, "LOGISTICS_UNAVAILABLE", "Logistics devolvió una respuesta inválida al cancelar.");
    }
    return payload.result;
  }

  private headers(correlationId: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      "x-internal-service-key": this.config.logisticsInternalServiceKey,
    };
    if (correlationId) headers["x-correlation-id"] = correlationId;
    return headers;
  }

  private object(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
