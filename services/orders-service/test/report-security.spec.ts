import { afterEach, describe, expect, it, vi } from "vitest";
import { OrdersReportGuard, reportIds } from "../src/orders/report.controller";
const id="a1000000-0000-4000-8000-000000000001";
afterEach(()=>vi.unstubAllEnvs());
describe("private reporting contracts",()=>{
  it("bounds and validates unique server-owned identities",()=>{expect(reportIds([id])).toEqual([id]);for(const ids of [[],[id,id],["forged"],Array.from({length:101},(_,i)=>`a1000000-0000-4000-8000-${String(i).padStart(12,"0")}`)])expect(()=>reportIds(ids,100)).toThrow();});
  it("keeps Analytics and CRM credentials distinct",()=>{
    vi.stubEnv("ANALYTICS_ORDERS_REPORT_KEY","analytics-private-test-key");vi.stubEnv("CRM_ORDERS_REPORT_KEY","crm-private-test-key");const guard=new OrdersReportGuard();const context=(caller:string,key:string)=>({switchToHttp:()=>({getRequest:()=>({headers:{"x-report-service":caller,"x-internal-service-key":key}})})}) as never;
    expect(guard.canActivate(context("analytics","analytics-private-test-key"))).toBe(true);expect(()=>guard.canActivate(context("crm","analytics-private-test-key"))).toThrow();expect(()=>guard.canActivate(context("customer","crm-private-test-key"))).toThrow();
  });
});
