import { describe, expect, it, vi } from "vitest";
import { CrmService } from "../src/crm/crm.service";
import { ApiException } from "../src/common/api-exception";
const referenceAt="2026-10-13T18:00:00.000Z";
const ids=["a1000000-0000-4000-8000-000000000001","a1000000-0000-4000-8000-000000000002","a1000000-0000-4000-8000-000000000003","a1000000-0000-4000-8000-000000000004"];
describe("authoritative inactive customers",()=>{
  it("separates old purchasers and old registrations without purchases, excluding recent purchases and registrations",async()=>{
    const query=vi.fn();const snapshot={referenceAt,users:ids.map((id,index)=>({id,name:"Cliente "+index,createdAt:index===3 ? "2026-10-01T00:00:00Z" : "2025-01-01T00:00:00Z"})),customers:ids.map((customerId,index)=>({customerId,firstPurchaseAt:index<2 ? "2025-01-01T00:00:00Z" : null,lastPurchaseAt:index===0 ? "2026-07-13T17:59:59.999Z" : index===1 ? referenceAt : null,completedOrders:index<2 ? 1 : 0,lifetimeTotal:index<2 ? 100 : 0,currency:"MXN"}))};
    const service=new CrmService({query} as never,{snapshot:vi.fn().mockResolvedValue(snapshot)} as never);
    const result=await service.inactiveSegment("3");expect(result.groups).toEqual({purchasers:1,neverPurchased:1});expect(result.customers.map(c=>c.customerId)).toEqual([ids[0],ids[2]]);expect(query).not.toHaveBeenCalled();
  });
  it("does not fall back to delayed CRM data when Orders or Auth cannot be verified",async()=>{
    const query=vi.fn();const service=new CrmService({query} as never,{snapshot:vi.fn().mockRejectedValue(new ApiException(503,"PURCHASE_ACTIVITY_UNAVAILABLE","Unavailable"))} as never);
    await expect(service.inactiveSegment("3")).rejects.toMatchObject({code:"PURCHASE_ACTIVITY_UNAVAILABLE"});expect(query).not.toHaveBeenCalled();
  });
});
