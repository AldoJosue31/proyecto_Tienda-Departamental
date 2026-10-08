import { describe,it,expect,vi } from "vitest";
import { NotificationDeliveryService } from "../src/notifications/notification-delivery.service";
function delivery(simulated=false,expired=false,failed=false) {
  const row={id:"id",campaign_id:"campaign",customer_id:"customer",coupon_code:"REGRESA",coupon_valid_until:new Date(expired ? 0 : Date.now()+60000),correlation_id:null,email:"customer@example.test",status:"PENDING",attempts:0,next_retry_at:null,locked_until:null};
  const writes:unknown[][]=[];
  const query=vi.fn(async (sql:string,values:unknown[])=>{
    if (sql.startsWith("SELECT")) return {rows:[{...row}]};
    writes.push([sql,values]);
    if (sql.includes("SET status = 'PROCESSING'")) {row.status="PROCESSING";row.attempts++;return {rows:[{...row}]};}
    return {rows:[]};
  });
  const database={query,withTransaction:(fn:(client:{query:typeof query})=>unknown)=>fn({query})};
  const send=failed ? vi.fn().mockRejectedValue(new Error("SMTP unavailable")) : vi.fn().mockResolvedValue({messageId:"fixture",simulated});
  const service=new NotificationDeliveryService(database as never,{findContact:vi.fn()} as never,{send} as never,{environment:"test",retryIntervalSeconds:1,retryLimit:3});
  return {service,send,writes,row};
}
describe("Delivery outcomes",()=>{
  it("publishes simulation without a sent event",async()=>{const fixture=delivery(true);await (fixture.service as unknown as {deliver(id:string):Promise<void>}).deliver("id");expect(JSON.stringify(fixture.writes)).toContain("notification.simulated.v1");expect(JSON.stringify(fixture.writes)).not.toContain("notification.sent.v1");});
  it("records SMTP acceptance separately",async()=>{const fixture=delivery();await (fixture.service as unknown as {deliver(id:string):Promise<void>}).deliver("id");expect(JSON.stringify(fixture.writes)).toContain("notification.sent.v1");expect(JSON.stringify(fixture.writes)).toContain("smtp");});
  it("does not send expired coupons",async()=>{const fixture=delivery(false,true);await (fixture.service as unknown as {deliver(id:string):Promise<void>}).deliver("id");expect(fixture.send).not.toHaveBeenCalled();expect(JSON.stringify(fixture.writes)).toContain("COUPON_EXPIRED");});
  it("marks temporary failures for bounded retry",async()=>{const fixture=delivery(false,false,true);await (fixture.service as unknown as {deliver(id:string):Promise<void>}).deliver("id");expect(JSON.stringify(fixture.writes)).toContain('\\"willRetry\\":true');});
  it("does not retry exhausted failures",async()=>{const fixture=delivery();fixture.row.status="FAILED";fixture.row.attempts=3;await (fixture.service as unknown as {deliver(id:string):Promise<void>}).deliver("id");expect(fixture.send).not.toHaveBeenCalled();});
});
