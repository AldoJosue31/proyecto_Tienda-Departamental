import assert from "node:assert/strict";
import { randomUUID,createHmac } from "node:crypto";
import { readFileSync,writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import pg from "pg";

const env=Object.fromEntries(readFileSync(".env.integration","utf8").trim().split(/\r?\n/).map(line=>{const at=line.indexOf("=");return [line.slice(0,at),line.slice(at+1)];}));
assert.equal(env.COMPOSE_PROJECT_NAME,"departamental-five-phases");
const ports={auth:55431,inventory:55433,pricing:55434,orders:55435,crm:55439,notification:55440,logistics:55438};
const pools={},databases={},checks=[];
const load=(domain,module)=>createRequire(new URL(`../services/${domain}-service/package.json`,import.meta.url))(`./dist/${module}.js`);
for (const [domain,port] of Object.entries(ports)) {
  const project=execFileSync("docker",["inspect","--format",'{{ index .Config.Labels "com.docker.compose.project" }}',`departamental-five-phases-${domain}-postgres-1`],{encoding:"utf8"}).trim();assert.equal(project,"departamental-five-phases");
  const pool=new pg.Pool({host:"127.0.0.1",port,database:`${domain}_service`,user:`${domain}_service`,password:env[domain.toUpperCase()+"_DB_PASSWORD"]});pools[domain]=pool;
  databases[domain]={query:(sql,values)=>pool.query(sql,values),withTransaction:async operation=>{const client=await pool.connect();try {await client.query("BEGIN");const result=await operation(client);await client.query("COMMIT");return result;}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}};
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(operation,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){const result=await operation();if(result)return result;await pause(250);}throw new Error("Integration state did not converge.");}
async function check(name,operation){const start=Date.now();const detail=await operation();checks.push({name,passed:true,milliseconds:Date.now()-start,...detail});console.log("PASS "+name);}
const gateway="http://localhost:8005",web="http://localhost:3105";
async function api(path,token,method="GET",body,headers={}){const response=await fetch(gateway+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{"Content-Type":"application/json"}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});return {status:response.status,body:await response.json().catch(()=>null)};}
const internalKey=purpose=>createHmac("sha256",env.JWT_ACCESS_SECRET).update(`departamental:coupons:${purpose}:v1`).digest("base64url");
async function privateApi(path,body,purpose="orders"){const response=await fetch("http://localhost:3304/internal/coupons/"+path,{method:"POST",headers:{"Content-Type":"application/json","x-internal-service-key":internalKey(purpose)},body:JSON.stringify(body)});return {status:response.status,body:await response.json().catch(()=>null)};}
const compose=(...args)=>execFileSync("docker",["compose","-p","departamental-five-phases","--env-file",".env.integration","-f","compose.yaml","-f","compose.integration.yaml",...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
try {
  const admin=(await api("/auth/login",null,"POST",{email:"admin@departamental.local",password:env.SEED_ADMIN_PASSWORD})).body;assert.ok(admin.accessToken);
  const token=admin.accessToken;
  const customerId=randomUUID(),otherId=randomUUID(),email=`coupon-${customerId.slice(0,8)}@example.test`;
  await pools.auth.query("INSERT INTO auth_users(id,email,name,password_hash,role,is_active) SELECT $1,$2,'Cliente de integración',password_hash,'CUSTOMER',TRUE FROM auth_users WHERE email='customer@departamental.local'",[customerId,email]);
  await pools.auth.query("INSERT INTO auth_users(id,email,name,password_hash,role,is_active) SELECT $1,$2,'Cliente de integración 2',password_hash,'CUSTOMER',TRUE FROM auth_users WHERE email='customer@departamental.local'",[otherId,`coupon-${otherId.slice(0,8)}@example.test`]);
  const customer=(await api("/auth/login",null,"POST",{email,password:env.SEED_CUSTOMER_PASSWORD})).body;assert.ok(customer.accessToken);
  const inventory=(await api("/inventory/branches",token)).body;
  const branchId=inventory.branches[0].id;
  const stocks=(await api(`/inventory/branches/${branchId}`,token)).body.items;
  const products=(await api("/products",token)).body.items;
  const stock=stocks.find(item=>products.some(product=>product.variants.some(variant=>variant.id===item.variantId)));
  const product=products.find(product=>product.variants.some(variant=>variant.id===stock.variantId));
  const variant=product.variants.find(variant=>variant.id===stock.variantId),variantId=variant.id;
  await pools.inventory.query("UPDATE inventory_stock SET on_hand=50,reserved=0 WHERE branch_id=$1 AND variant_id=$2",[branchId,variantId]);
  const {CrmService}=load("crm","crm/crm.service"),crm=new CrmService(databases.crm);
  for (const id of [customerId,otherId]) await crm.project({eventId:randomUUID(),eventType:"order.completed.v1",occurredAt:new Date(Date.now()-250*86400000).toISOString(),correlationId:null,orderId:randomUUID(),customerId:id,branchId,currency:"MXN",total:100,items:[]});
  const code="FINAL"+randomUUID().slice(0,8).toUpperCase();
  const input={months:3,couponCode:code,validUntil:new Date(Date.now()+86400000).toISOString(),discountType:"PERCENTAGE",discountValue:20,targetScope:"VARIANT",targetId:variantId};
  let campaign;
  await check("CRM confirmation persists explicit coupon definition and request idempotency",async()=>{
    const headers={Cookie:`departamental_access=${token}`,"Content-Type":"application/json","Idempotency-Key":randomUUID()};
    const response=await fetch(web+"/api/crm/campaigns",{method:"POST",headers,body:JSON.stringify(input)});assert.equal(response.status,202);campaign=(await response.json()).campaign;
    const replay=await fetch(web+"/api/crm/campaigns",{method:"POST",headers,body:JSON.stringify(input)});assert.equal((await replay.json()).campaign.id,campaign.id);
    const changed=await fetch(web+"/api/crm/campaigns",{method:"POST",headers,body:JSON.stringify({...input,discountValue:30})});assert.equal(changed.status,409);
  });
  const {CampaignOutboxService}=load("crm","crm/campaign-outbox.service");
  process.env.JWT_ACCESS_SECRET=env.JWT_ACCESS_SECRET;process.env.PRICING_SERVICE_URL="http://localhost:3304";
  const outbox=new CampaignOutboxService(databases.crm,{environment:"integration",rabbitmqUrl:`amqp://departamental:${env.RABBITMQ_PASSWORD}@localhost:55672`,outboxPublishIntervalMilliseconds:60000});
  await outbox.flush();await outbox.onModuleDestroy();
  await check("coupon right exists before real SMTP capture and accepted status reaches CRM",async()=>{
    await until(async()=>{const row=(await pools.notification.query("SELECT status FROM notification_deliveries WHERE campaign_id=$1 AND customer_id=$2",[campaign.id,customerId])).rows[0];return row?.status==="SENT";});
    assert.equal((await pools.pricing.query("SELECT status FROM pricing_coupon_rights WHERE campaign_id=$1 AND customer_id=$2",[campaign.id,customerId])).rows[0].status,"AVAILABLE");
    await until(async()=>(await crm.campaign(campaign.id)).campaign.sentCount>=2);
    const messages=await (await fetch("http://localhost:18025/api/v1/messages")).json();const message=messages.messages.find(message=>message.Subject.includes(code));assert.ok(message);
    const detail=await (await fetch("http://localhost:18025/api/v1/message/"+message.ID)).json();assert.match(detail.Text,new RegExp(code));assert.ok(detail.To.some(recipient=>recipient.Address===email || recipient.Address.startsWith("coupon-")));
  });
  await check("public clients cannot issue rights or impersonate a coupon owner",async()=>{
    assert.equal((await api("/internal/coupons/issue",token,"POST",{})).status,404);
    const response=await fetch("http://localhost:3304/internal/coupons/issue",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});assert.equal(response.status,401);
    const seed=(await api("/auth/login",null,"POST",{email:"customer@departamental.local",password:env.SEED_CUSTOMER_PASSWORD})).body;
    const denied=await api("/pricing/coupons/quote",seed.accessToken,"POST",{code,customerId,lines:[{variantId,productId:product.id,categoryId:product.category.id,basePrice:variant.listPrice,currency:"MXN",quantity:1}]});assert.equal(denied.status,422);
  });
  const order={branchId,channel:"ONLINE",couponCode:code,items:[{productId:product.id,variantId,quantity:1}]};
  let confirmed;
  await check("concurrent orders cannot consume a customer's coupon twice",async()=>{
    const responses=await Promise.all([api("/orders",customer.accessToken,"POST",order,{"Idempotency-Key":randomUUID()}),api("/orders",customer.accessToken,"POST",order,{"Idempotency-Key":randomUUID()})]);
    assert.equal(responses.filter(response=>response.status===201).length,1,JSON.stringify(responses.map(response=>({status:response.status,code:response.body?.code}))));confirmed=responses.find(response=>response.status===201).body.order;
    assert.ok(confirmed.items[0].unitPrice<=Math.round(variant.listPrice*0.8*100)/100);assert.equal(confirmed.couponCode,code);
    assert.equal((await pools.pricing.query("SELECT status FROM pricing_coupon_rights WHERE campaign_id=$1 AND customer_id=$2",[campaign.id,customerId])).rows[0].status,"USED");
  });
  await check("accepted pre-dispatch cancellation restores the original right",async()=>{
    await until(async()=>{const list=await api("/shipments",customer.accessToken);return list.body?.shipments?.some(shipment=>shipment.orderId===confirmed.id);});
    const cancelled=await api(`/orders/${confirmed.id}/cancel`,customer.accessToken,"POST",{reason:"Integration cancellation"});assert.equal(cancelled.status,201,JSON.stringify(cancelled.body));
    await until(async()=>(await pools.pricing.query("SELECT status FROM pricing_coupon_rights WHERE campaign_id=$1 AND customer_id=$2",[campaign.id,customerId])).rows[0].status==="AVAILABLE");
    assert.equal((await pools.pricing.query("SELECT valid_until FROM pricing_coupon_campaigns WHERE id=$1",[campaign.id])).rows[0].valid_until.toISOString(),input.validUntil);
  });
  await check("checkout BFF verifies the coupon and replays the same confirmed order",async()=>{
    const headers={Cookie:`departamental_access=${customer.accessToken}`,"Content-Type":"application/json"};
    const preview=await fetch(web+"/api/checkout/coupon",{method:"POST",headers,body:JSON.stringify({code,items:order.items})});assert.equal(preview.status,200);assert.ok((await preview.json()).discountTotal>0);
    headers["Idempotency-Key"]=randomUUID();
    const create=await fetch(web+"/api/checkout",{method:"POST",headers,body:JSON.stringify(order)});assert.equal(create.status,201);confirmed=(await create.json()).order;
    const replay=await fetch(web+"/api/checkout",{method:"POST",headers,body:JSON.stringify(order)});assert.equal((await replay.json()).order.id,confirmed.id);
    await until(async()=>(await api("/shipments",customer.accessToken)).body.shipments.some(shipment=>shipment.orderId===confirmed.id));
  });
  await check("stock failure releases the reserved coupon without a second use",async()=>{
    const issued={campaignId:randomUUID(),customerId,code:"FAIL"+randomUUID().slice(0,8).toUpperCase(),discountType:"PERCENTAGE",discountValue:10,targetScope:"ALL",validUntil:input.validUntil};assert.equal((await privateApi("issue",issued,"crm")).status,201);
    await pools.inventory.query("UPDATE inventory_stock SET on_hand=0,reserved=0 WHERE branch_id=$1 AND variant_id=$2",[branchId,variantId]);
    const failed=await api("/orders",customer.accessToken,"POST",{...order,couponCode:issued.code},{"Idempotency-Key":randomUUID()});assert.equal(failed.body.code,"OUT_OF_STOCK");
    assert.equal((await pools.pricing.query("SELECT status FROM pricing_coupon_rights WHERE campaign_id=$1 AND customer_id=$2",[issued.campaignId,customerId])).rows[0].status,"AVAILABLE");
    await pools.inventory.query("UPDATE inventory_stock SET on_hand=20,reserved=0 WHERE branch_id=$1 AND variant_id=$2",[branchId,variantId]);
  });
  await check("API recovery completes an interrupted coupon settlement",async()=>{
    await pools.pricing.query("UPDATE pricing_coupon_rights SET status='RESERVED' WHERE order_id=$1",[confirmed.id]);
    const {CouponsService}=load("pricing","coupons/coupons.service");
    process.env.ORDERS_SERVICE_URL="http://localhost:3305";
    const couponService=new CouponsService(databases.pricing,{});await couponService.reconcile();
    assert.equal((await pools.pricing.query("SELECT status FROM pricing_coupon_rights WHERE order_id=$1",[confirmed.id])).rows[0].status,"USED");
  });
  const {NotificationDeliveryService}=load("notification","notifications/notification-delivery.service"),{EmailProvider}=load("notification","notifications/email.provider");
  let retryCalls=0;
  const delivery=new NotificationDeliveryService(databases.notification,{findContact:async()=>({email})},{send:async()=>{if (++retryCalls<2) throw new Error("Temporary SMTP failure");return {messageId:"fixture-retry",simulated:false};}},{environment:"test",retryIntervalSeconds:1,retryLimit:3});
  await check("temporary and persistent delivery failures use bounded retries",async()=>{
    const event={eventId:randomUUID(),eventType:"coupon.email.requested.v1",occurredAt:new Date().toISOString(),correlationId:null,campaignId:randomUUID(),customerId,couponCode:"RETRY",validUntil:input.validUntil};
    await delivery.receive(event);assert.equal(retryCalls,1);await pools.notification.query("UPDATE notification_deliveries SET next_retry_at=NOW() WHERE campaign_id=$1",[event.campaignId]);await delivery.retryDue();assert.equal(retryCalls,2);
    assert.equal((await pools.notification.query("SELECT status FROM notification_deliveries WHERE campaign_id=$1",[event.campaignId])).rows[0].status,"SENT");
    let calls=0;const permanent=new NotificationDeliveryService(databases.notification,{findContact:async()=>({email})},{send:async()=>{calls++;throw new Error("Permanent failure");}},{environment:"test",retryIntervalSeconds:1,retryLimit:2});
    const failed={...event,eventId:randomUUID(),campaignId:randomUUID()};await permanent.receive(failed);await pools.notification.query("UPDATE notification_deliveries SET next_retry_at=NOW() WHERE campaign_id=$1",[failed.campaignId]);await permanent.retryDue();await permanent.retryDue();assert.equal(calls,2);
  });
  await check("simulation and expired delivery never report SMTP acceptance",async()=>{
    const campaign2=await crm.createCampaign({...input,couponCode:"SIM"+randomUUID().slice(0,8).toUpperCase()},admin.user.id,randomUUID(),null);
    const simulated=new NotificationDeliveryService(databases.notification,{findContact:async()=>({email})},new EmailProvider({deliveryMode:"log",smtpUrl:null,fromEmail:"test@example.test"}),{environment:"test",retryIntervalSeconds:1,retryLimit:3});
    const event={eventId:randomUUID(),eventType:"coupon.email.requested.v1",occurredAt:new Date().toISOString(),correlationId:null,campaignId:campaign2.campaign.id,customerId:otherId,couponCode:campaign2.campaign.couponCode,validUntil:input.validUntil};await simulated.receive(event);await simulated.receive(event);
    const row=(await pools.notification.query("SELECT id,status,attempts FROM notification_deliveries WHERE campaign_id=$1 AND customer_id=$2",[event.campaignId,otherId])).rows[0];assert.equal(row.status,"SIMULATED");assert.equal(row.attempts,1);
    await crm.applyDeliveryStatus({eventId:randomUUID(),eventType:"notification.simulated.v1",occurredAt:new Date().toISOString(),correlationId:null,campaignId:event.campaignId,customerId:otherId,notificationId:row.id,deliveryMode:"log"});assert.equal((await crm.campaign(event.campaignId)).campaign.simulatedCount,1);
    const expired={...event,eventId:randomUUID(),campaignId:randomUUID(),validUntil:new Date(0).toISOString()};await simulated.receive(expired);assert.equal((await pools.notification.query("SELECT failure_code FROM notification_deliveries WHERE campaign_id=$1",[expired.campaignId])).rows[0].failure_code,"COUPON_EXPIRED");
  });
  await check("delivery survives a Notification service restart without duplicate SMTP messages",async()=>{
    const before=await (await fetch("http://localhost:18025/api/v1/messages")).json();compose("restart","servicio-notificaciones");await pause(1500);const after=await (await fetch("http://localhost:18025/api/v1/messages")).json();assert.equal(after.total,before.total);
  });
  let shipment=(await api("/shipments",customer.accessToken)).body.shipments.find(shipment=>shipment.orderId===confirmed.id);
  await check("logistics tracks packing, courier location, dispatch and delivery with role restrictions",async()=>{
    const denied=await api(`/shipments/${shipment.id}/status`,customer.accessToken,"PATCH",{status:"PACKING",version:shipment.version});assert.equal(denied.status,403);
    let result=await api(`/shipments/${shipment.id}/status`,token,"PATCH",{status:"PACKING",version:shipment.version});assert.equal(result.status,200);shipment=result.body.shipment;
    const courierId=randomUUID();result=await api(`/shipments/${shipment.id}/tracking`,token,"PATCH",{courierId,courierName:"Repartidor de prueba",deliveryAddress:"Zócalo, Ciudad de México, México",version:shipment.version});assert.equal(result.status,200);shipment=result.body.shipment;
    result=await api(`/shipments/${shipment.id}/status`,token,"PATCH",{status:"SHIPPED",version:shipment.version});assert.equal(result.status,200);shipment=result.body.shipment;
    assert.equal((await api(`/couriers/${courierId}/location`,token,"POST",{shipmentId:shipment.id,latitude:95,longitude:-99.13})).status,400);
    assert.equal((await api(`/couriers/${courierId}/location`,token,"POST",{shipmentId:shipment.id,latitude:19.435,longitude:-99.14,recordedAt:new Date(Date.now()-600000).toISOString()})).status,201);
    assert.equal((await api(`/shipments/${shipment.id}`,token)).body.tracking.locationFreshness,"STALE");
    assert.equal((await api(`/couriers/${courierId}/location`,token,"POST",{shipmentId:shipment.id,latitude:19.435,longitude:-99.14,recordedAt:new Date().toISOString()})).status,201);
    const deniedCancellation=await api(`/orders/${confirmed.id}/cancel`,customer.accessToken,"POST",{reason:"Too late"});assert.equal(deniedCancellation.status,409);
    result=await api(`/shipments/${shipment.id}/status`,token,"PATCH",{status:"DELIVERED",version:shipment.version});assert.equal(result.status,200);
  });
  await check("CRM history retains the customer's confirmed price snapshot",async()=>{
    const profile=await until(async()=>{const response=await api(`/customers/${customerId}`,token);return response.body?.purchases?.some(purchase=>purchase.orderId===confirmed.id) ? response.body : null;});assert.equal(profile.purchases.find(purchase=>purchase.orderId===confirmed.id).total,confirmed.total);
  });
  writeFileSync("docs/verification-final-phases.json",JSON.stringify({completedAt:new Date().toISOString(),project:env.COMPOSE_PROJECT_NAME,checks},null,2)+"\n");
  const browserCode="BROWSER"+randomUUID().slice(0,8).toUpperCase();
  assert.equal((await privateApi("issue",{campaignId:randomUUID(),customerId,code:browserCode,discountType:"PERCENTAGE",discountValue:20,targetScope:"ALL",validUntil:input.validUntil},"crm")).status,201);
  writeFileSync(".env.browser-fixture",`EMAIL=${email}\nPASSWORD=${env.SEED_CUSTOMER_PASSWORD}\nCOUPON=${browserCode}\nCUSTOMER_ID=${customerId}\nPRODUCT_ID=${product.id}\nVARIANT_ID=${variantId}\nBRANCH_ID=${branchId}\nORDER_ID=${confirmed.id}\nSHIPMENT_ID=${shipment.id}\n`,{mode:0o600});
  console.log(`${checks.length} final-phase integration checks passed.`);
} finally { await Promise.all(Object.values(pools).map(pool=>pool.end())); }
