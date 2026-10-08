import { describe,it,expect,vi } from "vitest";
import { CouponsService } from "../src/coupons/coupons.service";
const variantId="d2000000-0000-4000-8000-000000000001";
const customerId="d3000000-0000-4000-8000-000000000001";
const line={variantId,productId:variantId,categoryId:variantId,basePrice:100,currency:"MXN",quantity:2};
function service(overrides:Record<string,unknown>={}, promotion=100) {
  const right={status:"AVAILABLE",valid_until:new Date(Date.now()+60000),discount_type:"PERCENTAGE",discount_value:"20",target_scope:"ALL",target_id:null,...overrides};
  const query=vi.fn().mockResolvedValue({rows:[right]});
  const database={withTransaction:(fn:(client:{query:typeof query})=>unknown)=>fn({query})};
  return new CouponsService(database as never,{quote:vi.fn().mockResolvedValue({effectivePrice:promotion})} as never);
}
describe("Coupon rules",()=>{
  it("uses the better promotion without stacking",async()=>{await expect(service({},70).quote({code:"REGRESA",customerId,lines:[line]})).resolves.toMatchObject({prices:[{unitPrice:70}],discountTotal:60});});
  it("applies the coupon when it provides the better price",async()=>{await expect(service({},90).quote({code:"REGRESA",customerId,lines:[line]})).resolves.toMatchObject({prices:[{unitPrice:80}],discountTotal:40});});
  it("caps a fixed unit discount at the item price",async()=>{await expect(service({discount_type:"FIXED",discount_value:"150"}).quote({code:"REGRESA",customerId,lines:[line]})).resolves.toMatchObject({prices:[{unitPrice:0}],discountTotal:200});});
  it("rejects an expired coupon",async()=>{await expect(service({valid_until:new Date(0)}).quote({code:"REGRESA",customerId,lines:[line]})).rejects.toMatchObject({code:"COUPON_EXPIRED"});});
  it("rejects a consumed right",async()=>{await expect(service({status:"USED"}).quote({code:"REGRESA",customerId,lines:[line]})).rejects.toMatchObject({code:"COUPON_USED"});});
  it("rejects another order's reservation",async()=>{await expect(service({status:"RESERVED"}).quote({code:"REGRESA",customerId,lines:[line]})).rejects.toMatchObject({code:"COUPON_RESERVED"});});
  it("rejects an inapplicable scope",async()=>{await expect(service({target_scope:"PRODUCT",target_id:customerId}).quote({code:"REGRESA",customerId,lines:[line]})).rejects.toMatchObject({code:"COUPON_SCOPE"});});
});
