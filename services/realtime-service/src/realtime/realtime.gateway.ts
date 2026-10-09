import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { WebSocketGateway, WebSocketServer, type OnGatewayConnection, type OnGatewayDisconnect } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

import { TokenService, type AccessTokenClaims } from "../auth/token.service";
import { AuthStatusClient } from "../auth/auth-status.client";
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
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly connections = new Map<string, { socket: Socket; claims: AccessTokenClaims; timer?: NodeJS.Timeout }>();

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly tokenService: TokenService,
    private readonly identities: AuthStatusClient,
    @Inject(REALTIME_RUNTIME_CONFIG)
    private readonly config: Pick<RealtimeRuntimeConfig, "corsOrigins">,
  ) {}

  afterInit(server: Server): void {
    server.use((socket, next) => {
      void (async () => {
        this.assertAllowedOrigin(socket);
        const claims = this.tokenService.verifyAccessToken(this.accessToken(socket));
        if (claims.role !== "ADMIN" && claims.role !== "EMPLOYEE") throw new Error("Forbidden socket role.");
        if (!await this.identities.isActive(claims) || socket.conn.readyState === "closed") throw new Error("Inactive identity.");
        socket.data.userId = claims.sub;
        socket.data.role = claims.role;
        socket.data.identityClaims = claims;
      })().then(() => next(), () => next(new Error("UNAUTHORIZED")));
    });
  }

  handleConnection(socket: Socket): void {
    const claims = socket.data.identityClaims as AccessTokenClaims | undefined;
    if (!claims) { socket.disconnect(true); return; }
    this.handleDisconnect(socket);
    const connection = { socket, claims, timer: undefined as NodeJS.Timeout | undefined };
    this.connections.set(socket.id, connection);
    const check = async (): Promise<void> => {
      if (this.connections.get(socket.id) !== connection) return;
      let active = false;
      try { active = await this.identities.isActive(claims); } catch { /* Fail closed. */ }
      if (this.connections.get(socket.id) !== connection) return;
      if (!active || !socket.connected) {
        this.handleDisconnect(socket);
        socket.disconnect(true);
        return;
      }
      // Sequential polling prevents overlapping requests and is cancelled on disconnect.
      connection.timer = setTimeout(() => { void check(); }, 1_000);
      connection.timer.unref();
    };
    connection.timer = setTimeout(() => { void check(); }, 1_000);
    connection.timer.unref();
  }

  handleDisconnect(socket: Socket): void {
    const connection = this.connections.get(socket.id);
    if (connection?.timer) clearTimeout(connection.timer);
    this.connections.delete(socket.id);
  }

  onModuleDestroy(): void {
    for (const connection of this.connections.values()) {
      this.handleDisconnect(connection.socket);
      connection.socket.disconnect(true);
    }
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
