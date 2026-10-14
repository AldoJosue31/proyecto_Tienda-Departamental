import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class CategoryReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CategoryReconciliationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly database: DatabaseService) {}
  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    this.timer=setInterval(()=>void this.reconcile(),30000); this.timer.unref(); void this.reconcile();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }
  async reconcile(): Promise<void> {
    if (this.running) return; this.running=true;
    try {
      const result=await this.database.query<{order_id:string}>("SELECT order_id FROM analytics_order_item_projection WHERE category_id IS NULL GROUP BY order_id ORDER BY MIN(category_checked_at) NULLS FIRST,order_id LIMIT 100");
      if (!result.rows.length) return;
      const ids=result.rows.map(row=>row.order_id);
      const response=await fetch(`${process.env.ORDERS_SERVICE_URL ?? "http://servicio-pedidos:3005"}/internal/reports/orders`,{method:"POST",headers:{"Content-Type":"application/json","x-report-service":"analytics","x-internal-service-key":process.env.ANALYTICS_ORDERS_REPORT_KEY ?? ""},body:JSON.stringify({ids}),signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error("Orders snapshot unavailable");
      const data=await response.json() as {orders:Array<{id:string;status:string;items:Array<{variantId:string;categoryId:string}>}>};
      await this.database.withTransaction(async client=>{
        for (const order of data.orders) {
          if (!ids.includes(order.id)) throw new Error("Unexpected snapshot identity");
          for (const item of order.items) await client.query("UPDATE analytics_order_item_projection SET category_id=$3,category_checked_at=NOW() WHERE order_id=$1 AND variant_id=$2 AND category_id IS NULL",[order.id,item.variantId,item.categoryId]);
          if (order.status === "CANCELLED") await client.query("UPDATE analytics_order_projection SET status='CANCELLED' WHERE order_id=$1",[order.id]);
        }
        // Unresolvable historic rows remain explicit, while later batches still progress.
        await client.query("UPDATE analytics_order_item_projection SET category_checked_at=NOW() WHERE order_id=ANY($1::uuid[]) AND category_id IS NULL",[ids]);
      });
    } catch { this.logger.warn("Category reconciliation will retry; historical gaps remain visible."); }
    finally { this.running=false; }
  }
}
