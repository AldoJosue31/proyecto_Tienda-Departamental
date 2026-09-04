import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import { PRICING_RUNTIME_CONFIG } from "../auth/token.service";
import { ApiException } from "../common/api-exception";
import type { Role } from "../config/environment";
import type { PricingRuntimeConfig } from "../config/environment";
import { DatabaseService } from "../database/database.service";
import { PricingOutboxService } from "../events/outbox.service";
import type { CreatePromotionDto, PromotionTargetDto, QuoteQueryDto, UpdatePromotionDto } from "./pricing.dto";
import type { DiscountType, Promotion, PromotionStatus, PromotionTarget, Quote } from "./pricing.types";

interface PromotionRow extends QueryResultRow {
  id: string;
  name: string;
  status: PromotionStatus;
  discount_type: DiscountType;
  discount_value: string | number;
  priority: number;
  starts_at: Date | string;
  ends_at: Date | string;
  timezone: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface TargetRow extends QueryResultRow {
  promotion_id: string;
  scope: PromotionTarget["scope"];
  target_id: string | null;
}

interface IdentifierRow extends QueryResultRow {
  id: string;
}

type Actor = { id: string; role: Role; correlationId: string | null };

@Injectable()
export class PricingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PricingService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly outbox: PricingOutboxService,
    @Inject(PRICING_RUNTIME_CONFIG)
    private readonly config: Pick<PricingRuntimeConfig, "schedulerIntervalSeconds" | "environment">,
  ) {}

  onModuleInit(): void {
    if (this.config.environment === "test") return;
    this.timer = setInterval(() => {
      void this.reconcilePromotionStates().catch(() => {
        this.logger.error("Promotion scheduler failed without exposing request or database data.");
      });
    }, this.config.schedulerIntervalSeconds * 1000);
    this.timer.unref();
    void this.reconcilePromotionStates().catch(() => {
      this.logger.error("Initial promotion reconciliation failed.");
    });
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async quote(input: QuoteQueryDto, now = new Date()): Promise<Quote> {
    const promotions = await this.database.query<PromotionRow>([
      "SELECT p.id, p.name, p.status, p.discount_type, p.discount_value, p.priority,",
      "  p.starts_at, p.ends_at, p.timezone, p.created_at, p.updated_at",
      "FROM pricing_promotions AS p",
      "WHERE p.status IN ('SCHEDULED', 'ACTIVE')",
      "  AND p.starts_at <= $1",
      "  AND p.ends_at > $1",
      "  AND EXISTS (",
      "    SELECT 1 FROM pricing_promotion_targets AS t",
      "    WHERE t.promotion_id = p.id AND (",
      "      t.scope = 'ALL'",
      "      OR (t.scope = 'VARIANT' AND t.target_id = $2)",
      "      OR (t.scope = 'PRODUCT' AND t.target_id = $3)",
      "      OR (t.scope = 'CATEGORY' AND t.target_id = $4)",
      "    )",
      "  )",
    ].join("\n"), [now, input.variantId, input.productId ?? null, input.categoryId ?? null]);
    const winner = this.selectPromotion(promotions.rows, input.basePrice);
    const basePrice = this.money(input.basePrice);
    const discountAmount = winner ? this.discount(basePrice, winner) : 0;
    const effectivePrice = this.money(Math.max(0, basePrice - discountAmount));
    return {
      variantId: input.variantId,
      basePrice,
      effectivePrice,
      currency: input.currency ?? "MXN",
      discountAmount: this.money(basePrice - effectivePrice),
      discountPercentage: basePrice === 0 ? 0 : Math.round(((basePrice - effectivePrice) / basePrice) * 100),
      appliedPromotion: winner
        ? { id: winner.id, name: winner.name, priority: winner.priority }
        : null,
      quotedAt: now.toISOString(),
    };
  }

  async listPromotions(): Promise<{ promotions: Promotion[] }> {
    const rows = await this.database.query<PromotionRow>(
      "SELECT id, name, status, discount_type, discount_value, priority, starts_at, ends_at, timezone, created_at, updated_at FROM pricing_promotions ORDER BY starts_at DESC, id DESC",
    );
    return { promotions: await this.withTargets(rows.rows) };
  }

  async createPromotion(body: CreatePromotionDto, actor: Actor): Promise<{ promotion: Promotion }> {
    this.validatePromotion(body.discountType, body.discountValue, body.startsAt, body.endsAt, body.timezone, body.targets);
    return this.database.withTransaction(async (client) => {
      const promotion = await client.query<PromotionRow>([
        "INSERT INTO pricing_promotions (name, status, discount_type, discount_value, priority, starts_at, ends_at, timezone, created_by)",
        "VALUES ($1, 'SCHEDULED', $2, $3, $4, $5, $6, $7, $8)",
        "RETURNING id, name, status, discount_type, discount_value, priority, starts_at, ends_at, timezone, created_at, updated_at",
      ].join("\n"), [
        body.name,
        body.discountType,
        body.discountValue,
        body.priority ?? 0,
        new Date(body.startsAt),
        new Date(body.endsAt),
        body.timezone,
        actor.id,
      ]);
      const row = this.required(promotion.rows[0], "Promotion creation failed.");
      await this.replaceTargets(client, row.id, body.targets);
      await this.audit(client, row.id, actor, "PROMOTION_CREATED");
      return { promotion: await this.hydrate(client, row) };
    });
  }

  async updatePromotion(id: string, body: UpdatePromotionDto, actor: Actor): Promise<{ promotion: Promotion }> {
    if (!this.uuid(id)) throw new ApiException(404, "PROMOTION_NOT_FOUND", "Promoción no encontrada");
    return this.database.withTransaction(async (client) => {
      const current = await client.query<PromotionRow>([
        "SELECT id, name, status, discount_type, discount_value, priority, starts_at, ends_at, timezone, created_at, updated_at",
        "FROM pricing_promotions WHERE id = $1 FOR UPDATE",
      ].join("\n"), [id]);
      const row = current.rows[0];
      if (!row) throw new ApiException(404, "PROMOTION_NOT_FOUND", "Promoción no encontrada");
      if (row.status === "EXPIRED") {
        throw new ApiException(409, "PROMOTION_EXPIRED", "Una promoción vencida no puede modificarse");
      }
      const values = {
        name: body.name ?? row.name,
        status: body.status ?? row.status,
        discountType: body.discountType ?? row.discount_type,
        discountValue: body.discountValue ?? Number(row.discount_value),
        priority: body.priority ?? row.priority,
        startsAt: body.startsAt ?? this.iso(row.starts_at),
        endsAt: body.endsAt ?? this.iso(row.ends_at),
        timezone: body.timezone ?? row.timezone,
      };
      const targets = body.targets ?? await this.targetsFor(client, id);
      this.validatePromotion(
        values.discountType,
        values.discountValue,
        values.startsAt,
        values.endsAt,
        values.timezone,
        targets,
      );
      const updated = await client.query<PromotionRow>([
        "UPDATE pricing_promotions",
        "SET name = $1, status = $2, discount_type = $3, discount_value = $4,",
        "  priority = $5, starts_at = $6, ends_at = $7, timezone = $8",
        "WHERE id = $9",
        "RETURNING id, name, status, discount_type, discount_value, priority, starts_at, ends_at, timezone, created_at, updated_at",
      ].join("\n"), [
        values.name, values.status, values.discountType, values.discountValue,
        values.priority, new Date(values.startsAt), new Date(values.endsAt),
        values.timezone, id,
      ]);
      const changed = this.required(updated.rows[0], "Promotion update failed.");
      if (body.targets) await this.replaceTargets(client, id, body.targets);
      await this.audit(client, id, actor, "PROMOTION_UPDATED");
      const promotion = await this.hydrate(client, changed);
      await this.enqueueStatusEvent(client, row.status, promotion, actor.correlationId);
      return { promotion };
    });
  }

  async deletePromotion(id: string, actor: Actor): Promise<void> {
    if (!this.uuid(id)) throw new ApiException(404, "PROMOTION_NOT_FOUND", "Promoción no encontrada");
    await this.database.withTransaction(async (client) => {
      const existing = await client.query<IdentifierRow>(
        "SELECT id FROM pricing_promotions WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (!existing.rows[0]) throw new ApiException(404, "PROMOTION_NOT_FOUND", "Promoción no encontrada");
      await this.audit(client, id, actor, "PROMOTION_DELETED");
      // The audit row must exist before deleting the parent. PostgreSQL then
      // applies the FK's ON DELETE SET NULL behavior and preserves the event.
      await client.query("DELETE FROM pricing_promotions WHERE id = $1", [id]);
    });
  }

  async reconcilePromotionStates(now = new Date()): Promise<{ activated: number; expired: number }> {
    return this.database.withTransaction(async (client) => {
      const expired = await client.query<IdentifierRow>([
        "UPDATE pricing_promotions SET status = 'EXPIRED'",
        "WHERE status IN ('SCHEDULED', 'ACTIVE') AND ends_at <= $1",
        "RETURNING id",
      ].join("\n"), [now]);
      const activated = await client.query<IdentifierRow>([
        "UPDATE pricing_promotions SET status = 'ACTIVE'",
        "WHERE status = 'SCHEDULED' AND starts_at <= $1 AND ends_at > $1",
        "RETURNING id",
      ].join("\n"), [now]);
      for (const row of expired.rows) {
        await this.audit(client, row.id, null, "PROMOTION_EXPIRED");
        await this.enqueuePromotionEvent(client, row.id, "promotion.expired.v1", null);
      }
      for (const row of activated.rows) {
        await this.audit(client, row.id, null, "PROMOTION_ACTIVATED");
        await this.enqueuePromotionEvent(client, row.id, "promotion.activated.v1", null);
      }
      return { activated: activated.rows.length, expired: expired.rows.length };
    });
  }

  private selectPromotion(rows: PromotionRow[], basePrice: number): PromotionRow | null {
    return rows.sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      const discountDifference = this.discount(basePrice, right) - this.discount(basePrice, left);
      if (discountDifference !== 0) return discountDifference;
      return this.toDate(left.created_at).getTime() - this.toDate(right.created_at).getTime();
    })[0] ?? null;
  }

  private discount(basePrice: number, promotion: PromotionRow): number {
    const value = Number(promotion.discount_value);
    return this.money(Math.min(
      basePrice,
      promotion.discount_type === "PERCENTAGE" ? basePrice * value / 100 : value,
    ));
  }

  private async withTargets(rows: PromotionRow[]): Promise<Promotion[]> {
    if (!rows.length) return [];
    const targets = await this.database.query<TargetRow>(
      "SELECT promotion_id, scope, target_id FROM pricing_promotion_targets WHERE promotion_id = ANY($1::uuid[])",
      [rows.map((row) => row.id)],
    );
    const byPromotion = new Map<string, PromotionTarget[]>();
    for (const target of targets.rows) {
      const values = byPromotion.get(target.promotion_id) ?? [];
      values.push({ scope: target.scope, targetId: target.target_id });
      byPromotion.set(target.promotion_id, values);
    }
    return rows.map((row) => this.map(row, byPromotion.get(row.id) ?? []));
  }

  private async hydrate(client: PoolClient, row: PromotionRow): Promise<Promotion> {
    return this.map(row, await this.targetsFor(client, row.id));
  }

  private async targetsFor(client: PoolClient, id: string): Promise<PromotionTarget[]> {
    const targets = await client.query<TargetRow>(
      "SELECT promotion_id, scope, target_id FROM pricing_promotion_targets WHERE promotion_id = $1 ORDER BY scope, target_id",
      [id],
    );
    return targets.rows.map((target) => ({ scope: target.scope, targetId: target.target_id }));
  }

  private async replaceTargets(client: PoolClient, promotionId: string, targets: PromotionTargetDto[] | PromotionTarget[]): Promise<void> {
    await client.query("DELETE FROM pricing_promotion_targets WHERE promotion_id = $1", [promotionId]);
    for (const target of targets) {
      await client.query(
        "INSERT INTO pricing_promotion_targets (promotion_id, scope, target_id) VALUES ($1, $2, $3)",
        [promotionId, target.scope, target.scope === "ALL" ? null : target.targetId ?? null],
      );
    }
  }

  private async audit(client: PoolClient, promotionId: string, actor: Actor | null, action: string): Promise<void> {
    await client.query([
      "INSERT INTO pricing_audit_log (promotion_id, actor_id, actor_role, action, correlation_id, result)",
      "VALUES ($1, $2, $3, $4, $5, 'SUCCEEDED')",
    ].join("\n"), [promotionId, actor?.id ?? null, actor?.role ?? null, action, actor?.correlationId ?? null]);
  }

  private async enqueueStatusEvent(
    client: PoolClient,
    previous: PromotionStatus,
    promotion: Promotion,
    correlationId: string | null,
  ): Promise<void> {
    if (previous === promotion.status) return;
    if (promotion.status === "ACTIVE") {
      await this.outbox.enqueue(client, {
        eventType: "promotion.activated.v1",
        correlationId,
        data: this.promotionEventData(promotion),
      });
    }
    if (promotion.status === "EXPIRED") {
      await this.outbox.enqueue(client, {
        eventType: "promotion.expired.v1",
        correlationId,
        data: this.promotionEventData(promotion),
      });
    }
  }

  private async enqueuePromotionEvent(
    client: PoolClient,
    promotionId: string,
    eventType: "promotion.activated.v1" | "promotion.expired.v1",
    correlationId: string | null,
  ): Promise<void> {
    const rows = await client.query<PromotionRow>(
      "SELECT id, name, status, discount_type, discount_value, priority, starts_at, ends_at, timezone, created_at, updated_at FROM pricing_promotions WHERE id = $1",
      [promotionId],
    );
    const row = this.required(rows.rows[0], "Promotion is missing while adding an event.");
    await this.outbox.enqueue(client, {
      eventType,
      correlationId,
      data: this.promotionEventData(await this.hydrate(client, row)),
    });
  }

  private promotionEventData(promotion: Promotion): Record<string, unknown> {
    return {
      promotionId: promotion.id,
      name: promotion.name,
      status: promotion.status,
      discountType: promotion.discountType,
      discountValue: promotion.discountValue,
      priority: promotion.priority,
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      timezone: promotion.timezone,
      targets: promotion.targets,
    };
  }

  private validatePromotion(
    discountType: DiscountType,
    discountValue: number,
    startsAt: string,
    endsAt: string,
    timezone: string,
    targets: PromotionTargetDto[] | PromotionTarget[],
  ): void {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
      throw new ApiException(400, "INVALID_PROMOTION_WINDOW", "La fecha final debe ser posterior a la inicial");
    }
    if (discountType === "PERCENTAGE" && discountValue > 100) {
      throw new ApiException(400, "INVALID_DISCOUNT", "El porcentaje de descuento no puede superar 100");
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(start);
    } catch {
      throw new ApiException(400, "INVALID_TIMEZONE", "La zona horaria no es válida");
    }
    const identities = new Set<string>();
    for (const target of targets) {
      if (target.scope === "ALL" && target.targetId) {
        throw new ApiException(400, "INVALID_PROMOTION_TARGET", "El alcance ALL no acepta un identificador");
      }
      if (target.scope !== "ALL" && !target.targetId) {
        throw new ApiException(400, "INVALID_PROMOTION_TARGET", "El alcance requiere un identificador");
      }
      const identity = target.scope + ":" + (target.targetId ?? "");
      if (identities.has(identity)) {
        throw new ApiException(400, "DUPLICATE_PROMOTION_TARGET", "El alcance de promoción está repetido");
      }
      identities.add(identity);
    }
  }

  private map(row: PromotionRow, targets: PromotionTarget[]): Promotion {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      discountType: row.discount_type,
      discountValue: Number(row.discount_value),
      priority: row.priority,
      startsAt: this.iso(row.starts_at),
      endsAt: this.iso(row.ends_at),
      timezone: row.timezone,
      targets,
      createdAt: this.iso(row.created_at),
      updatedAt: this.iso(row.updated_at),
    };
  }

  private required<T>(value: T | undefined, message: string): T {
    if (!value) throw new Error(message);
    return value;
  }

  private money(value: number): number {
    return Number(value.toFixed(2));
  }

  private toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }

  private iso(value: Date | string): string {
    return this.toDate(value).toISOString();
  }

  private uuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
