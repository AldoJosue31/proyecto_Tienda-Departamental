import { Inject, Injectable, Logger } from "@nestjs/common";
import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

import { TokenService } from "../auth/token.service";
import { REALTIME_RUNTIME_CONFIG } from "../auth/token.service";
import type { RealtimeRuntimeConfig } from "../config/environment";
import type { CourierLocationUpdatedEvent, StockUpdatedEvent } from "./realtime.types";

const accessTokenCookie = "departamental_access";

@WebSocketGateway({
  path: "/realtime/socket.io",
  transports: ["websocket", "polling"],
  cors: {
    origin(origin, callback) {
      const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
        .split(",")
        .map((value) => value.trim());
      callback(origin === undefined || origins.includes(origin) ? null : new Error("Origin is not allowed."), origin !== undefined && origins.includes(origin));
    },
    credentials: true,
  },
})
@Injectable()
export class RealtimeGateway {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly tokenService: TokenService,
    @Inject(REALTIME_RUNTIME_CONFIG)
    private readonly config: Pick<RealtimeRuntimeConfig, "corsOrigins">,
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      try {
        this.assertAllowedOrigin(socket);
        const claims = this.tokenService.verifyAccessToken(this.accessToken(socket));
        if (claims.role !== "ADMIN" && claims.role !== "EMPLOYEE") throw new Error("Forbidden socket role.");
        socket.data.userId = claims.sub;
        socket.data.role = claims.role;
        next();
      } catch {
        next(new Error("UNAUTHORIZED"));
      }
    });
  }

  broadcastStockUpdated(event: StockUpdatedEvent): void {
    this.server.emit("stock.updated", event);
    this.logger.debug("Published stock.updated to authenticated dashboard clients.");
  }

  broadcastCourierLocationUpdated(event: CourierLocationUpdatedEvent): void {
    this.server.emit("courier.location.updated", event);
    this.logger.debug("Published courier.location.updated to authenticated operations clients.");
  }

  private assertAllowedOrigin(socket: Socket): void {
    const origin = socket.handshake.headers.origin;
    if (origin && !this.config.corsOrigins.includes(origin)) throw new Error("Origin is not allowed.");
  }

  private accessToken(socket: Socket): string {
    const cookieHeader = socket.handshake.headers.cookie;
    const raw = cookieHeader?.split(";").map((entry) => entry.trim())
      .find((entry) => entry.startsWith(accessTokenCookie + "="))?.slice(accessTokenCookie.length + 1);
    if (!raw) throw new Error("Access token cookie is required.");
    return decodeURIComponent(raw);
  }
}
