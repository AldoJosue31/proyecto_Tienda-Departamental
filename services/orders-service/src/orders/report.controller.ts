import { Body, CanActivate, Controller, ExecutionContext, Injectable, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import { ApiException } from "../common/api-exception";

type ReportRequest = { headers: Record<string, string | undefined> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function reportIds(input: unknown, maximum = 1000): string[] {
  if (!Array.isArray(input) || !input.length || input.length > maximum || input.some(id => typeof id !== "string" || !uuid.test(id)) || new Set(input).size !== input.length) throw new ApiException(400, "VALIDATION_ERROR", "El lote requiere identificadores únicos y tiene un límite explícito.");
  return input as string[];
}
@Injectable()
export class OrdersReportGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const headers = context.switchToHttp().getRequest<ReportRequest>().headers;
    const caller = headers["x-report-service"];
    const expected = caller === "analytics" ? process.env.ANALYTICS_ORDERS_REPORT_KEY : caller === "crm" ? process.env.CRM_ORDERS_REPORT_KEY : undefined;
    const actual = Buffer.from(headers["x-internal-service-key"] ?? "");
    if (!expected || actual.length !== Buffer.byteLength(expected) || !timingSafeEqual(actual, Buffer.from(expected))) throw new UnauthorizedException("Private report credential required.");
    return true;
  }
}
// These routes are deliberately absent from Kong. Each caller gets a separate credential.
@Controller("internal/reports") @UseGuards(OrdersReportGuard)
export class OrdersReportController {
  constructor(private readonly database: DatabaseService) {}
  @Post("orders") async snapshots(@Body() body: { ids?: unknown }) {
    const ids = reportIds(body.ids, 100);
    const result = await this.database.query(`SELECT o.id, o.customer_id AS "customerId", o.branch_id AS "branchId", o.status, o.currency, o.total,
      COALESCE((SELECT MIN(created_at) FROM orders_audit_log WHERE order_id=o.id AND action='ORDER_CONFIRMED'),o.created_at) AS "completedAt",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('productId',i.product_id,'categoryId',i.category_id,'variantId',i.variant_id,'productName',i.product_name,'sku',i.sku,'variantLabel',i.variant_label,'quantity',i.quantity,'listUnitPrice',i.list_unit_price,'unitPrice',i.unit_price,'lineDiscountTotal',i.line_discount_total,'lineTotal',i.line_total) ORDER BY i.id) FROM order_items i WHERE i.order_id=o.id),'[]'::jsonb) AS items,
      o.subtotal, o.discount_total AS "discountTotal", o.coupon_code AS "couponCode"
      FROM orders o WHERE o.id=ANY($1::uuid[])`, [ids]);
    return { orders: result.rows.map(row => ({ ...row, total: Number(row.total), subtotal: Number(row.subtotal), discountTotal: Number(row.discountTotal) })) };
  }
  @Post("customer-activity") async activity(@Body() body: { ids?: unknown }, @Req() request: ReportRequest) {
    if (request.headers["x-report-service"] !== "crm") throw new ApiException(403, "FORBIDDEN", "Esta consulta requiere la credencial CRM.");
    const ids = reportIds(body.ids);
    // One SQL snapshot fixes the eligibility instant, independently of delayed CRM events.
    const result = await this.database.query(`WITH confirmed AS (
      SELECT o.customer_id, o.total, o.currency, COALESCE((SELECT MIN(created_at) FROM orders_audit_log WHERE order_id=o.id AND action='ORDER_CONFIRMED'),o.created_at) AS completed_at
      FROM orders o WHERE o.customer_id=ANY($1::uuid[]) AND o.status IN ('CONFIRMED','CANCELLATION_PENDING'))
      SELECT requested.id AS "customerId", MIN(c.completed_at) AS "firstPurchaseAt", MAX(c.completed_at) AS "lastPurchaseAt",
      COUNT(c.customer_id)::int AS "completedOrders", COALESCE(SUM(c.total) FILTER (WHERE c.currency='MXN'),0) AS "lifetimeTotal", statement_timestamp() AS "referenceAt"
      FROM unnest($1::uuid[]) AS requested(id) LEFT JOIN confirmed c ON c.customer_id=requested.id GROUP BY requested.id`, [ids]);
    return { referenceAt: result.rows[0]?.referenceAt ?? new Date().toISOString(), customers: result.rows.map(row => ({ ...row, referenceAt: undefined, lifetimeTotal: Number(row.lifetimeTotal), currency: "MXN" })) };
  }
  @Post("customer-orders") async customerOrders(@Body() body: { ids?: unknown }, @Req() request: ReportRequest) {
    if (request.headers["x-report-service"] !== "crm") throw new ApiException(403,"FORBIDDEN","Esta consulta requiere la credencial CRM.");
    const ids=reportIds(body.ids,1);
    const result=await this.database.query<{id:string}>("SELECT id FROM orders WHERE customer_id=$1 AND status IN ('CONFIRMED','CANCELLATION_PENDING') ORDER BY created_at DESC,id DESC LIMIT 101",[ids[0]!]);
    const snapshots=result.rows.length ? await this.snapshots({ids:result.rows.slice(0,100).map(row=>row.id)}) : {orders:[]};
    return {...snapshots,complete:result.rows.length<=100};
  }
}
