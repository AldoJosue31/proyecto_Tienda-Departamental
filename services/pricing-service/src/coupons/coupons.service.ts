import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { createHash } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { ApiException } from "../common/api-exception";
import { PricingService } from "../pricing/pricing.service";
import { couponServiceKey } from "./internal-coupon.guard";

export interface CouponLine { variantId: string; productId: string; categoryId: string; basePrice: number; currency: string; quantity: number; }
export interface CouponPrice { variantId: string; unitPrice: number; basePrice?:number; }
type Scope = "ALL" | "CATEGORY" | "PRODUCT" | "VARIANT";
interface Definition { campaignId: string; customerId: string; code: string; discountType: "PERCENTAGE" | "FIXED"; discountValue: number; targetScope: Scope; targetId?: string | null; validUntil: string; }
interface Right { campaign_id: string; customer_id: string; code: string; discount_type: "PERCENTAGE" | "FIXED"; discount_value: string; target_scope: Scope; target_id: string | null; valid_until: Date; status: "AVAILABLE" | "RESERVED" | "USED"; order_id: string | null; request_hash: string | null; prices: CouponPrice[] | null; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

@Injectable()
export class CouponsService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly logger = new Logger(CouponsService.name);
  constructor(private readonly database: DatabaseService, private readonly pricing: PricingService) {}
  onModuleInit(): void { if (process.env.NODE_ENV !== "test") { this.timer = setInterval(() => void this.reconcile(), 30000); this.timer.unref(); void this.reconcile(); } }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async issue(value: Definition): Promise<{ issued: true }> {
    if (!value || typeof value !== "object") this.fail("INVALID_COUPON_DEFINITION","Define el cupón.",400);
    const targetId = value.targetScope === "ALL" ? null : value.targetId;
    if (!uuid.test(value.campaignId ?? "") || !uuid.test(value.customerId ?? "") || !/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(value.code ?? "") || !["PERCENTAGE","FIXED"].includes(value.discountType) || !Number.isFinite(value.discountValue) || value.discountValue <= 0 || Math.abs(value.discountValue * 100 - Math.round(value.discountValue * 100)) > 0.000001 || value.discountValue > (value.discountType === "PERCENTAGE" ? 100 : 9999999.99) || !["ALL","CATEGORY","PRODUCT","VARIANT"].includes(value.targetScope) || (value.targetScope !== "ALL" && !uuid.test(targetId ?? "")) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value.validUntil ?? "") || !(Date.parse(value.validUntil) > Date.now())) this.fail("INVALID_COUPON_DEFINITION", "La definición del cupón no es válida.", 422);
    const definition = { code: value.code, discountType: value.discountType, discountValue: value.discountValue, targetScope: value.targetScope, targetId: targetId ?? null, validUntil: new Date(value.validUntil).toISOString() };
    await this.database.withTransaction(async (client) => {
      await client.query("INSERT INTO pricing_coupon_campaigns(id,code,definition_hash,discount_type,discount_value,target_scope,target_id,valid_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING", [value.campaignId,value.code,hash(definition),value.discountType,value.discountValue,value.targetScope,targetId ?? null,value.validUntil]);
      const stored = await client.query<{ id: string; definition_hash: string }>("SELECT id,definition_hash FROM pricing_coupon_campaigns WHERE code=$1", [value.code]);
      if (stored.rows[0]?.id !== value.campaignId || stored.rows[0]?.definition_hash !== hash(definition)) this.fail("COUPON_CODE_CONFLICT", "El código ya pertenece a otra campaña o definición.");
      await client.query("INSERT INTO pricing_coupon_rights(campaign_id,customer_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[value.campaignId,value.customerId]);
    });
    return { issued: true };
  }

  async quote(value: { code: string; customerId: string; orderId?: string; lines: CouponLine[] }, reserve = false): Promise<{ prices: CouponPrice[]; discountTotal: number }> {
    if (!value || typeof value !== "object") this.fail("INVALID_COUPON","Revisa el cupón.",400);
    const code = typeof value.code === "string" ? value.code.trim().toUpperCase() : "";
    if (!/^[A-Z0-9][A-Z0-9_-]{2,63}$/.test(code) || !uuid.test(value.customerId ?? "") || (reserve && !uuid.test(value.orderId ?? "")) || !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 20) this.fail("INVALID_COUPON", "Revisa el cupón y los artículos.",400);
    if (new Set(value.lines.map(line => line.variantId)).size !== value.lines.length || new Set(value.lines.map(line => line.currency)).size !== 1) this.fail("INVALID_COUPON", "El pedido debe contener variantes únicas y una sola moneda.",400);
    for (const line of value.lines) if (![line.variantId,line.productId,line.categoryId].every(id=>uuid.test(id ?? "")) || !Number.isFinite(line.basePrice) || line.basePrice < 0 || line.basePrice > 9999999.99 || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000000 || !/^[A-Z]{3}$/.test(line.currency ?? "")) this.fail("INVALID_COUPON", "Los artículos del cupón no son válidos.",400);
    return this.database.withTransaction(async (client) => {
      const row = await client.query<Right>("SELECT r.*, c.code,c.discount_type,c.discount_value,c.target_scope,c.target_id,c.valid_until FROM pricing_coupon_rights r JOIN pricing_coupon_campaigns c ON c.id=r.campaign_id WHERE c.code=$1 AND r.customer_id=$2 FOR UPDATE OF r",[code,value.customerId]);
      const right = row.rows[0];
      if (!right) this.fail("COUPON_NOT_OWNED", "El cupón no es válido para tu cuenta.",422);
      const requestHash = hash(value.lines.map(line=>({variantId:line.variantId,productId:line.productId,quantity:line.quantity,currency:line.currency})));
      if (reserve && right.order_id === value.orderId && right.prices) {
        if (right.request_hash !== requestHash) this.fail("COUPON_REQUEST_CHANGED", "La reserva pertenece a otros artículos.");
        return this.result(right.prices,value.lines);
      }
      if (right.status === "USED") this.fail("COUPON_USED", "Este cupón ya fue utilizado.",422);
      if (right.status === "RESERVED") this.fail("COUPON_RESERVED", "Este cupón está reservado por otro pedido.");
      if (new Date(right.valid_until).getTime() <= Date.now()) this.fail("COUPON_EXPIRED", "El cupón ya venció.",422);
      if (right.discount_type === "FIXED" && value.lines.some(line=>line.currency !== "MXN")) this.fail("COUPON_CURRENCY","El importe fijo de este cupón está definido en MXN.",422);
      let applicable = false;
      const prices: CouponPrice[] = [];
      for (const line of value.lines) {
        const quote = await this.pricing.quote(line);
        const matches = right.target_scope === "ALL" || right.target_id === (right.target_scope === "CATEGORY" ? line.categoryId : right.target_scope === "PRODUCT" ? line.productId : line.variantId);
        if (matches) applicable = true;
        const amount = right.discount_type === "PERCENTAGE" ? money(line.basePrice * Number(right.discount_value) / 100) : Number(right.discount_value);
        prices.push({ variantId: line.variantId,basePrice:line.basePrice, unitPrice: money(matches ? Math.min(quote.effectivePrice, Math.max(0,line.basePrice-amount)) : quote.effectivePrice) });
      }
      if (!applicable) this.fail("COUPON_SCOPE", "El cupón no aplica a los artículos de tu bolsa.",422);
      if (reserve) await client.query("UPDATE pricing_coupon_rights SET status='RESERVED',order_id=$3,request_hash=$4,prices=$5::jsonb,updated_at=NOW(),checked_at=NOW() WHERE campaign_id=$1 AND customer_id=$2",[right.campaign_id,value.customerId,value.orderId,requestHash,JSON.stringify(prices)]);
      return this.result(prices,value.lines);
    });
  }

  async settle(orderId: string, action: "commit" | "release" | "restore"): Promise<{ settled: true }> {
    if (!uuid.test(orderId ?? "") || !["commit","release","restore"].includes(action)) this.fail("INVALID_COUPON_OPERATION", "Operación de cupón inválida.",400);
    await this.database.withTransaction(async client => {
      const result = await client.query<Right>("SELECT * FROM pricing_coupon_rights WHERE order_id=$1 FOR UPDATE",[orderId]);
      const right = result.rows[0];
      if (!right) return;
      if (action === "commit" && right.status === "RESERVED") await client.query("UPDATE pricing_coupon_rights SET status='USED',updated_at=NOW(),checked_at=NOW() WHERE order_id=$1",[orderId]);
      if ((action === "release" && right.status === "RESERVED") || action === "restore") await client.query("UPDATE pricing_coupon_rights SET status='AVAILABLE',order_id=NULL,request_hash=NULL,prices=NULL,updated_at=NOW(),checked_at=NOW() WHERE order_id=$1",[orderId]);
    });
    return { settled: true };
  }

  async reconcile(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.database.query<{ order_id: string }>("SELECT order_id FROM pricing_coupon_rights WHERE status IN ('RESERVED','USED') ORDER BY checked_at ASC LIMIT 100");
      for (const row of rows.rows) {
        try {
          const response = await fetch(new URL("/internal/coupons/orders/" + row.order_id,process.env.ORDERS_SERVICE_URL || "http://servicio-pedidos:3005"),{headers:{"x-internal-service-key":couponServiceKey("orders")},signal:AbortSignal.timeout(5000)});
          if (!response.ok) continue;
          const state = await response.json() as { status?: string; outcomeCode?: string | null };
          if (state.status === "CONFIRMED") await this.settle(row.order_id,"commit");
          else if (state.status === "CANCELLED") await this.settle(row.order_id,"restore");
          else if (state.outcomeCode === "OUT_OF_STOCK") await this.settle(row.order_id,"release");
        } catch { this.logger.warn("Coupon recovery will retry an Orders API request."); }
        finally { await this.database.query("UPDATE pricing_coupon_rights SET checked_at=NOW() WHERE order_id=$1",[row.order_id]); }
      }
    } catch { this.logger.warn("Coupon reconciliation will retry."); }
    finally { this.running = false; }
  }

  private result(prices: CouponPrice[], lines: CouponLine[]) {
    return { prices, discountTotal: money(lines.reduce((sum,line)=>{
      const price = prices.find(candidate=>candidate.variantId===line.variantId);
      return sum + ((price?.basePrice ?? line.basePrice) - (price?.unitPrice ?? line.basePrice)) * line.quantity;
    },0)) };
  }
  private fail(code: string, message: string, status = 409): never { throw new ApiException(status,code,message); }
}
