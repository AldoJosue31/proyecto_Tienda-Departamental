import { Inject, Injectable } from "@nestjs/common";
import { INVENTORY_RUNTIME_CONFIG } from "./token.service";
import { isRole, type Role } from "../config/environment";
import type { AuthStatusConfig } from "../config/auth-status";

export interface IdentityClaims { sub: string; role: Role; uv: number; exp: number; }
interface IdentityStatus { id: string; role: Role; isActive: boolean; authVersion: number; }
interface CacheEntry { status: IdentityStatus; expiresAt: number; }

const cacheMilliseconds = 30_000;
const timeoutMilliseconds = 3_000;
const maximumCachedIdentities = 10_000;

/** Auth owns identity state. Business services never read Auth's database. */
@Injectable()
export class AuthStatusClient {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<IdentityStatus | null>>();

  constructor(@Inject(INVENTORY_RUNTIME_CONFIG) private readonly config: AuthStatusConfig) {}

  async isActive(claims: IdentityClaims): Promise<boolean> {
    if (!Number.isSafeInteger(claims.uv) || claims.uv < 0 || claims.exp * 1000 <= Date.now()) return false;
    const status = await this.status(claims.sub);
    return status !== null && status.isActive && status.id === claims.sub
      && status.role === claims.role && status.authVersion === claims.uv
      && claims.exp * 1000 > Date.now();
  }

  private async status(userId: string): Promise<IdentityStatus | null> {
    const now = performance.now();
    const entry = this.cache.get(userId);
    if (entry && entry.expiresAt > now) return entry.status;
    this.cache.delete(userId);
    const running = this.pending.get(userId);
    if (running) return running;

    // Age starts BEFORE the request, so network latency never extends revocation.
    const startedAt = performance.now();
    const task = this.fetchStatus(userId).then((status) => {
      if (status?.isActive && startedAt + cacheMilliseconds > performance.now()) {
        if (this.cache.size >= maximumCachedIdentities) {
          const oldest = this.cache.keys().next().value;
          if (oldest !== undefined) this.cache.delete(oldest);
        }
        this.cache.set(userId, { status, expiresAt: startedAt + cacheMilliseconds });
      }
      return status;
    }).finally(() => { this.pending.delete(userId); });
    this.pending.set(userId, task);
    return task;
  }

  private async fetchStatus(userId: string): Promise<IdentityStatus | null> {
    try {
      const response = await fetch(this.config.authServiceUrl + "/internal/auth/users/" + encodeURIComponent(userId) + "/status", {
        headers: { "x-internal-service-key": this.config.authStatusInternalServiceKey, "cache-control": "no-store" },
        signal: AbortSignal.timeout(timeoutMilliseconds),
        redirect: "error",
      });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null || !("user" in body)) return null;
      const user: unknown = body.user;
      if (typeof user !== "object" || user === null) return null;
      const candidate = user as Partial<IdentityStatus>;
      if (candidate.id !== userId || !isRole(candidate.role) || typeof candidate.isActive !== "boolean"
        || !Number.isSafeInteger(candidate.authVersion) || Number(candidate.authVersion) < 0) return null;
      return candidate as IdentityStatus;
    } catch {
      // There is no stale-success fallback after TTL. An unavailable Auth fails closed.
      return null;
    }
  }
}

