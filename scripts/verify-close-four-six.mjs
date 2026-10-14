import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import pg from "pg";
import {localCrmAuthority,seedInactiveCustomer} from "./verification-authority.mjs";
const project="departamental-five-phases",gateway="http://localhost:8005",web="http://localhost:3105";
const env=Object.fromEntries(readFileSync(".env.integration","utf8").split(/\r?\n/).filter(line=>line&&!line.startsWith("#")).map(line=>{const at=line.indexOf("=");return[line.slice(0,at),line.slice(at+1).replace(/^(['"])(.*)\1$/,"$2")];}));
assert.equal(env.COMPOSE_PROJECT_NAME,project);
const docker=(...args)=>execFileSync("docker",args,{encoding:"utf8",timeout:60000,stdio:["ignore","pipe","pipe"]});
const pools={},ports={auth:55431,orders:55435,analytics:55437,crm:55439,inventory:55433,logistics:55438,notification:55440,pricing:55434};
for(const [domain,port] of Object.entries(ports)){const state=JSON.parse(docker("inspect",`${project}-${domain}-postgres-1`))[0];assert.equal(state.Config.Labels["com.docker.compose.project"],project);pools[domain]=new pg.Pool({host:"127.0.0.1",port,database:domain+"_service",user:domain+"_service",password:env[domain.toUpperCase()+"_DB_PASSWORD"]});}
const load=(domain,module)=>createRequire(new URL(`../services/${domain}-service/package.json`,import.meta.url))(`./dist/${module}.js`);
const authority=localCrmAuthority(load,env),checks=[],stopped=new Set(),suffix=randomUUID().slice(0,8);
async function api(path,{token,body,method="GET",base=gateway,headers={}}={}){const response=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{"Content-Type":"application/json"}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const parsed=await response.json().catch(()=>null);if(response.status>=500)console.error(`HTTP ${response.status} ${method} ${path} (${typeof parsed?.code==="string" ? parsed.code : "UPSTREAM_ERROR"})`);return{status:response.status,body:parsed};}
async function check(name,operation){const start=Date.now();await operation();checks.push({name,passed:true,milliseconds:Date.now()-start});console.log("PASS "+name);}
async function until(operation,timeout=65000){const start=Date.now();while(Date.now()-start<timeout){try{const result=await operation();if(result)return result;}catch{/* projection or dependency may be catching up */}await new Promise(resolve=>setTimeout(resolve,400));}throw Error("EXPECTED_STATE_NOT_REACHED");}
async function login(role,email){const result=await api("/auth/login",{method:"POST",body:{email:email??`${role}@departamental.local`,password:env[`SEED_${role.toUpperCase()}_PASSWORD`]}});assert.equal(result.status,200);return result.body;}
async function sale(actor,branchId,product,variant,quantity=1,extra={}){const result=await api("/orders",{token:actor.accessToken,method:"POST",headers:{"Idempotency-Key":randomUUID()},body:{branchId,channel:"PHYSICAL",customerId:customer.user.id,items:[{productId:product.id,variantId:variant.id,quantity}],...extra}});assert.equal(result.status,201);return result.body.order;}
let admin,customer,employee,failure,products=[];
try{
  admin=await login("admin");customer=await login("customer");const demoCourier=await login("employee");
  // A fresh courier makes old/fresh timestamp checks independent of earlier runs.
  const proofCourierId=randomUUID(),proofCourierEmail=`courier-proof-${proofCourierId.slice(0,12)}@example.test`;
  await pools.auth.query("INSERT INTO auth_users(id,email,name,password_hash,role,is_active,onboarding_status,email_verified_at,verification_source) SELECT $1,$2,'Repartidor universitario de prueba',password_hash,'EMPLOYEE',TRUE,'READY',NOW(),'TEST_FIXTURE' FROM auth_users WHERE email='employee@departamental.local'",[proofCourierId,proofCourierEmail]);
  employee=await login("employee",proofCourierEmail);
  const cookie=token=>({Cookie:`departamental_access=${token}`,Origin:web});
  await check("new public operations require JWT and private directories/reports stay behind purpose credentials",async()=>{
    assert.equal((await api("/couriers")).status,401);assert.equal((await api("/couriers",{token:customer.accessToken})).status,403);
    assert.equal((await api("/internal/directory",{token:admin.accessToken})).status,404);
    assert.equal((await api("/internal/directory",{base:"http://127.0.0.1:3301"})).status,401);
    assert.equal((await api("/internal/reports/customer-activity",{method:"POST",body:{ids:[customer.user.id]},base:"http://127.0.0.1:3305"})).status,401);
  });
  // Repeated local runs must not crowd a Top 20 with our earlier synthetic ranks.
  // Cancel only this runner's unmistakable PHYSICAL fixtures through Orders,
  // preserving stock compensation, audit, rows and events. Never delete data.
  const priorSales=(await pools.orders.query("SELECT o.id FROM orders o WHERE o.channel='PHYSICAL' AND o.status='CONFIRMED' AND o.created_by=$1 AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id=o.id) AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id=o.id AND (i.product_name !~ '^Universidad (Prenda|Equipo) [0-9a-f]{8}$' OR i.sku !~ '^UNI-[0-9A-F]{8}-[01]-[01]$'))",[admin.user.id])).rows;
  for(const sale of priorSales){const cancellation=await api(`/orders/${sale.id}/cancel`,{token:admin.accessToken,method:"POST",body:{reason:"Retirar una venta sintética de una ejecución anterior del verificador universitario"}});assert.ok([200,201].includes(cancellation.status));assert.equal(cancellation.body.order.status,"CANCELLED");}
  // The older runner also inserts standalone Analytics fixtures. Confirm their
  // source orders are absent before closing only those synthetic projections.
  const standalone=(await pools.analytics.query("SELECT DISTINCT o.order_id FROM analytics_order_projection o JOIN analytics_order_item_projection i USING(order_id) WHERE o.status='COMPLETED' AND i.product_name IN ('Producto con variantes','Otro producto')")).rows.map(row=>row.order_id);
  const {AnalyticsService}=load("analytics","analytics/analytics.service"),localAnalytics=new AnalyticsService({query:(sql,values)=>pools.analytics.query(sql,values),withTransaction:async operation=>{const client=await pools.analytics.connect();try{await client.query('BEGIN');const result=await operation(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}});
  for(let offset=0;offset<standalone.length;offset+=100){const ids=standalone.slice(offset,offset+100);const source=await api("/internal/reports/orders",{base:"http://127.0.0.1:3305",method:"POST",headers:{"x-report-service":"analytics","x-internal-service-key":env.ANALYTICS_ORDERS_REPORT_KEY},body:{ids}});assert.equal(source.status,201);const official=new Set(source.body.orders.map(order=>order.id));for(const id of ids)if(!official.has(id))await localAnalytics.project({eventId:randomUUID(),eventType:"order.cancelled.v1",occurredAt:new Date().toISOString(),correlationId:null,orderId:id});}
  if(priorSales.length)await until(async()=>Number((await pools.analytics.query("SELECT COUNT(*)::int AS n FROM analytics_order_projection WHERE order_id=ANY($1::uuid[]) AND status='COMPLETED'",[priorSales.map(sale=>sale.id)])).rows[0].n)===0);
  const branches=(await api("/inventory/branches",{token:admin.accessToken})).body.branches;
  const branchA=branches[0].id,branchB=branches[1].id;
  const presentation=(await api("/products")).body.items.find(product=>product.imageUrl)?.imageUrl;
  for(const [index,prices] of [[0,[100,100]],[1,[200]]]){
    const created=await api("/products",{token:admin.accessToken,method:"POST",body:{name:`Universidad ${index===0?"Prenda":"Equipo"} ${suffix}`,category:{name:`Universidad ${index===0?"Moda":"Electrónica"} ${suffix}`},brand:{name:"Universidad"},description:"Datos sintéticos para demostrar los reportes y el reparto.",...(presentation ? {imageUrl:presentation}: {})}});assert.equal(created.status,201);const product=created.body.product;
    for(let number=0;number<prices.length;number++){const variant=await api(`/products/${product.id}/variants`,{token:admin.accessToken,method:"POST",body:{sku:`UNI-${suffix.toUpperCase()}-${index}-${number}`,size:number===0?"M":"L",color:"Azul",material:"Algodón",listPrice:prices[number],currency:"MXN"}});assert.equal(variant.status,201);product.variants.push(variant.body.variant);}
    products.push(product);
    for(const variant of product.variants)for(const branchId of [branchA,branchB])assert.equal((await api("/inventory/movements",{token:admin.accessToken,method:"POST",body:{variantId:variant.id,branchId,type:"RECEIPT",quantity:100,catalogSnapshot:{productName:product.name,sku:variant.sku,variantLabel:variant.label}}})).status,201);
  }
  const [a,b]=products;
  const sales=[await sale(admin,branchA,a,a.variants[0],6),await sale(admin,branchB,a,a.variants[1],6),await sale(admin,branchA,b,b.variants[0],9)];
  await until(async()=>Number((await pools.analytics.query("SELECT COUNT(*)::int AS n FROM analytics_order_projection WHERE order_id=ANY($1::uuid[])",[sales.map(s=>s.id)])).rows[0].n)===3);
  await check("rankings aggregate 6+6 variants and compare units versus revenue for all CDMX periods",async()=>{
    for(const period of ["today","7d","30d"]){const units=(await api(`/analytics/products/top?period=${period}&limit=20&metric=units`,{token:admin.accessToken})).body.products;const revenue=(await api(`/analytics/products/top?period=${period}&limit=20&metric=sales`,{token:admin.accessToken})).body.products;assert.equal(units.find(p=>p.productId===a.id).unitsSold,12);assert.equal(units.find(p=>p.productId===b.id).unitsSold,9);assert.ok(units.findIndex(p=>p.productId===a.id)<units.findIndex(p=>p.productId===b.id));assert.ok(revenue.findIndex(p=>p.productId===b.id)<revenue.findIndex(p=>p.productId===a.id));const cats=(await api(`/analytics/categories/top?period=${period}&limit=20`,{token:admin.accessToken})).body;assert.equal(cats.categories.find(c=>c.categoryId===a.category.id).unitsSold,12);assert.equal(cats.categories.find(c=>c.categoryId===b.category.id).sales,1800);assert.equal(cats.categories.find(c=>c.categoryId===a.category.id).nameSource,"CURRENT_CATALOG");}
  });
  await check("inventory bar and pie data match every authoritative branch and BFF exposes categories",async()=>{
    await until(async()=>{const report=(await api("/analytics/inventory/by-branch",{token:admin.accessToken})).body;for(const branch of branches){const official=(await api(`/inventory/branches/${branch.id}`,{token:admin.accessToken})).body.items;const projected=report.branches.find(row=>row.branchId===branch.id);for(const key of ["onHand","reserved","available"])if(projected[key]!==official.reduce((sum,row)=>sum+row[key],0))return false;}return true;});
    const result=await api("/api/dashboard/analytics?limit=20",{base:web,headers:cookie(admin.accessToken)});assert.equal(result.status,200);assert.ok(result.body.topCategories.categories.some(c=>c.categoryId===a.category.id));
  });
  await check("legacy category identity is recovered through the private Orders batch API",async()=>{
    await pools.analytics.query("UPDATE analytics_order_item_projection SET category_id=NULL,category_checked_at=NULL WHERE order_id=$1",[sales[0].id]);
    await until(async()=>(await pools.analytics.query("SELECT category_id FROM analytics_order_item_projection WHERE order_id=$1",[sales[0].id])).rows[0]?.category_id===a.category.id);
  });
  await check("repeated cancellation adjusts sales, categories and ticket average exactly once",async()=>{
    const before=(await api("/analytics/ticket-average",{token:admin.accessToken})).body;
    const cancelled=await Promise.all([1,2].map(()=>api(`/orders/${sales[1].id}/cancel`,{token:admin.accessToken,method:"POST",body:{reason:"Fixture universitaria"}})));assert.ok(cancelled.every(r=>[200,201].includes(r.status)&&r.body.order.status==="CANCELLED"));
    await until(async()=>(await pools.analytics.query("SELECT status FROM analytics_order_projection WHERE order_id=$1",[sales[1].id])).rows[0]?.status==="CANCELLED");
    const after=(await api("/analytics/ticket-average",{token:admin.accessToken})).body;assert.equal(after.completedOrders,before.completedOrders-1);assert.equal(after.sales,Math.round((before.sales-600)*100)/100);assert.equal(after.ticketAverage,Math.round(after.sales/after.completedOrders*100)/100);
    const category=(await api("/analytics/categories/top?limit=20",{token:admin.accessToken})).body.categories.find(c=>c.categoryId===a.category.id);assert.equal(category.unitsSold,6);assert.equal(category.sales,600);
  });
  const oldBuyer=randomUUID(),oldNever=randomUUID(),returning=randomUUID(),recent=randomUUID();
  for(const [id,purchased] of [[oldBuyer,true],[returning,true],[oldNever,false],[recent,false]])await seedInactiveCustomer(pools.auth,pools.orders,id,branchA,admin.user.id,{purchased});
  await pools.auth.query("UPDATE auth_users SET created_at=NOW() WHERE id=$1",[recent]);
  await check("inactive preview includes separate old purchasers and old registrations without purchases",async()=>{
    const response=await api("/segments/inactive?months=3",{token:admin.accessToken});assert.equal(response.status,200);const segment=response.body;assert.equal(segment.segment.includesNeverPurchased,true);assert.ok(segment.customers.some(c=>c.customerId===oldBuyer&&c.segmentGroup==="PURCHASER"));assert.ok(segment.customers.some(c=>c.customerId===oldNever&&c.segmentGroup==="NEVER_PURCHASED"));assert.ok(!segment.customers.some(c=>c.customerId===recent));assert.ok(segment.groups.purchasers>=2&&segment.groups.neverPurchased>=1);
  });
  let campaign;const code="UNI"+suffix.toUpperCase(),campaignInput={months:3,couponCode:code,validUntil:new Date(Date.now()+86400000).toISOString(),discountType:"PERCENTAGE",discountValue:50,targetScope:"ALL"};
  await check("campaign excludes a newly completed purchase even while its CRM event is delayed",async()=>{
    docker("stop",`${project}-rabbitmq-1`);stopped.add("rabbitmq");await sale(admin,branchA,a,a.variants[0],1,{customerId:returning});
    const headers={...cookie(admin.accessToken),"Idempotency-Key":randomUUID()};const result=await api("/api/crm/campaigns",{base:web,method:"POST",headers,body:campaignInput});assert.equal(result.status,202);campaign=result.body.campaign;
    const replay=await api("/api/crm/campaigns",{base:web,method:"POST",headers,body:campaignInput});assert.equal(replay.body.campaign.id,campaign.id);
    const recipients=(await pools.crm.query("SELECT customer_id,segment_group FROM crm_campaign_recipients WHERE campaign_id=$1",[campaign.id])).rows;assert.ok(!recipients.some(r=>r.customer_id===returning||r.customer_id===recent));assert.ok(recipients.some(r=>r.customer_id===oldNever&&r.segment_group==="NEVER_PURCHASED"));assert.ok(recipients.some(r=>r.customer_id===oldBuyer));assert.ok(campaign.referenceAt&&campaign.cutoffAt);
    docker("start",`${project}-rabbitmq-1`);stopped.delete("rabbitmq");await until(async()=>JSON.parse(docker("inspect",`${project}-rabbitmq-1`))[0].State.Health.Status==="healthy");
  });
  await check("RabbitMQ, coupon rights and actual SMTP capture deliver to an old customer without purchases",async()=>{
    const {DatabaseService}=load("crm","database/database.service");const database=new DatabaseService({databaseUrl:`postgresql://crm_service:${env.CRM_DB_PASSWORD}@127.0.0.1:55439/crm_service`,databaseSsl:false});const {CampaignOutboxService}=load("crm","crm/campaign-outbox.service");process.env.JWT_ACCESS_SECRET=env.JWT_ACCESS_SECRET;process.env.PRICING_SERVICE_URL="http://127.0.0.1:3304";
    const outbox=new CampaignOutboxService(database,{environment:"integration",rabbitmqUrl:`amqp://departamental:${env.RABBITMQ_PASSWORD}@127.0.0.1:55672`,outboxPublishIntervalMilliseconds:60000},authority);
    try{await outbox.flush();}finally{await outbox.onModuleDestroy();await database.onModuleDestroy();}
    await until(async()=>(await pools.notification.query("SELECT status FROM notification_deliveries WHERE campaign_id=$1 AND customer_id=$2",[campaign.id,oldNever])).rows[0]?.status==="SENT");
    const email=`regression-${oldNever.slice(0,12)}@example.test`;const messages=await(await fetch("http://127.0.0.1:18025/api/v1/search?query="+encodeURIComponent("to:"+email))).json();assert.ok(messages.messages.length>0);const message=await(await fetch("http://127.0.0.1:18025/api/v1/message/"+messages.messages[0].ID)).json();assert.ok((message.Text+message.HTML).includes(code));
    assert.equal((await pools.pricing.query("SELECT status FROM pricing_coupon_rights WHERE campaign_id=$1 AND customer_id=$2",[campaign.id,oldNever])).rows[0].status,"AVAILABLE");
  });
  const buyer=await login("customer",`regression-${oldNever.slice(0,12)}@example.test`);const items=[{productId:a.id,variantId:a.variants[0].id,quantity:1}];let online;
  await check("BFF coupon purchase keeps the authoritative discounted snapshot in CRM history",async()=>{
    const quote=await api("/api/pricing/cart",{base:web,method:"POST",headers:cookie(buyer.accessToken),body:{items,couponCode:code}});assert.equal(quote.status,200);assert.ok(quote.body.total<100);
    const headers={...cookie(buyer.accessToken),"Idempotency-Key":randomUUID()};const body={branchId:branchA,items,couponCode:code,expectedTotal:quote.body.total};const result=await api("/api/checkout",{base:web,method:"POST",headers,body});assert.equal(result.status,201);online=result.body.order;const replay=await api("/api/checkout",{base:web,method:"POST",headers,body});assert.equal(replay.body.order.id,online.id);
    const profile=await api(`/customers/${oldNever}`,{token:admin.accessToken});assert.equal(profile.status,200);const purchase=profile.body.purchases.find(p=>p.orderId===online.id);assert.equal(purchase.total,quote.body.total);assert.equal(purchase.items[0].unitPrice,quote.body.total);assert.ok(purchase.discountTotal>0);assert.equal(purchase.couponCode,code);
    assert.equal((await pools.pricing.query("SELECT status FROM pricing_coupon_rights WHERE campaign_id=$1 AND customer_id=$2",[campaign.id,oldNever])).rows[0].status,"USED");
  });
  let shipment=await until(async()=>{const list=(await api("/shipments",{token:admin.accessToken})).body.shipments;return list.find(s=>s.orderId===online.id);});
  await check("courier selection uses enabled employee identities and ignores a forged display name",async()=>{
    const list=await api("/couriers",{token:admin.accessToken});assert.equal(list.status,200);assert.ok(list.body.couriers.some(p=>p.id===employee.user.id));
    let result=await api(`/shipments/${shipment.id}/status`,{token:admin.accessToken,method:"PATCH",body:{status:"PACKING",version:shipment.version}});assert.equal(result.status,200);shipment=result.body.shipment;
    assert.equal((await api(`/shipments/${shipment.id}/tracking`,{token:admin.accessToken,method:"PATCH",body:{courierId:customer.user.id,courierName:"Forged",deliveryAddress:"Zócalo CDMX",version:shipment.version}})).status,422);
    result=await api(`/shipments/${shipment.id}/tracking`,{token:admin.accessToken,method:"PATCH",body:{courierId:employee.user.id,courierName:"Forged",deliveryAddress:"Zócalo, Ciudad de México, México",version:shipment.version}});assert.equal(result.status,200);assert.equal(result.body.tracking.courier.name,employee.user.name);shipment=result.body.shipment;
    result=await api(`/shipments/${shipment.id}/status`,{token:admin.accessToken,method:"PATCH",body:{status:"SHIPPED",version:shipment.version}});assert.equal(result.status,200);shipment=result.body.shipment;
  });
  const other=randomUUID();await pools.auth.query("INSERT INTO auth_users(id,email,name,password_hash,role,is_active,onboarding_status,email_verified_at,verification_source) SELECT $1,$2,'Segundo repartidor universitario',password_hash,'EMPLOYEE',TRUE,'READY',NOW(),'TEST_FIXTURE' FROM auth_users WHERE email='employee@departamental.local'",[other,`courier-${other.slice(0,12)}@example.test`]);const colleague=await login("employee",`courier-${other.slice(0,12)}@example.test`);
  await check("another employee cannot publish, take ownership or advance someone else's shipment",async()=>{
    assert.equal((await api(`/couriers/${employee.user.id}/location`,{token:colleague.accessToken,method:"POST",body:{shipmentId:shipment.id,latitude:19.43,longitude:-99.13,source:"DEMO"}})).status,403);
    assert.equal((await api(`/shipments/${shipment.id}/tracking`,{token:colleague.accessToken,method:"PATCH",body:{courierId:other,courierName:"Forged",deliveryAddress:"Destino",version:shipment.version}})).status,403);
    assert.equal((await api(`/shipments/${shipment.id}/status`,{token:colleague.accessToken,method:"PATCH",body:{status:"DELIVERED",version:shipment.version}})).status,403);
    assert.ok(!(await api("/couriers/me/shipments",{token:colleague.accessToken})).body.shipments.some(s=>s.id===shipment.id));
  });
  await check("location sources are explicit, stale positions cannot overwrite fresh ones and customer GPS stays private",async()=>{
    const path=`/couriers/${employee.user.id}/location`;const stale=new Date(Date.now()-600000).toISOString();assert.equal((await api(path,{token:employee.accessToken,method:"POST",body:{shipmentId:shipment.id,latitude:19.42,longitude:-99.14,recordedAt:stale,source:"DEMO"}})).status,201);
    assert.equal((await api(`/shipments/${shipment.id}`,{token:admin.accessToken})).body.tracking.locationFreshness,"STALE");
    const current=new Date().toISOString();const fresh=await api("/api/delivery/location",{base:web,headers:cookie(employee.accessToken),method:"POST",body:{shipmentId:shipment.id,latitude:19.432,longitude:-99.135,recordedAt:current,source:"DEMO"}});assert.equal(fresh.status,201);
    const late=await api(path,{token:employee.accessToken,method:"POST",body:{shipmentId:shipment.id,latitude:20,longitude:-100,recordedAt:stale,source:"DEMO"}});assert.equal(late.body.location.recordedAt,current);assert.equal(late.body.location.latitude,19.432);
    const route=await api(`/api/operations/shipments/${shipment.id}/route-estimate`,{base:web,headers:cookie(admin.accessToken)});assert.equal(route.status,200);assert.equal(route.body.destination.latitude,19.4326);assert.match(route.body.reason,/ficticio/);
    const own=await api(`/shipments/${shipment.id}`,{token:buyer.accessToken});assert.equal(own.status,200);assert.equal(own.body.tracking,undefined);assert.equal((await api(`/shipments/${shipment.id}`,{token:customer.accessToken})).status,403);
  });
  await check("concurrent delivery has one audited actor/time and one stale-version conflict",async()=>{
    const outcomes=await Promise.all([1,2].map(()=>api(`/shipments/${shipment.id}/status`,{token:employee.accessToken,method:"PATCH",body:{status:"DELIVERED",version:shipment.version}})));assert.deepEqual(outcomes.map(o=>o.status).sort(),[200,409]);const delivered=outcomes.find(o=>o.status===200).body;assert.ok(delivered.shipment.deliveredAt);const transitions=delivered.transitions.filter(t=>t.toStatus==="DELIVERED");assert.equal(transitions.length,1);assert.equal(transitions[0].actorId,employee.user.id);
    assert.equal((await api(`/shipments/${shipment.id}`,{token:buyer.accessToken})).body.shipment.status,"DELIVERED");
  });
  const demo=await sale(buyer,branchA,a,a.variants[0],1,{channel:"ONLINE",customerId:buyer.user.id});let demoShipment=await until(async()=>(await api("/shipments",{token:admin.accessToken})).body.shipments.find(s=>s.orderId===demo.id));
  for(const state of ["PACKING","SHIPPED"]){if(state==="SHIPPED"){const assigned=await api(`/shipments/${demoShipment.id}/tracking`,{token:admin.accessToken,method:"PATCH",body:{courierId:demoCourier.user.id,courierName:demoCourier.user.name,deliveryAddress:"Zócalo, Ciudad de México, México",version:demoShipment.version}});assert.equal(assigned.status,200);demoShipment=assigned.body.shipment;}const updated=await api(`/shipments/${demoShipment.id}/status`,{token:admin.accessToken,method:"PATCH",body:{status:state,version:demoShipment.version}});assert.equal(updated.status,200);demoShipment=updated.body.shipment;}
  assert.equal((await api("/api/delivery/location",{base:web,headers:cookie(demoCourier.accessToken),method:"POST",body:{shipmentId:demoShipment.id,latitude:19.432,longitude:-99.135,recordedAt:new Date().toISOString(),source:"DEMO"}})).status,201);
  writeFileSync(".env.phases-four-six-fixture",`CUSTOMER_ID=${oldNever}\nCUSTOMER_EMAIL=regression-${oldNever.slice(0,12)}@example.test\nCUSTOMER_PASSWORD=${env.SEED_CUSTOMER_PASSWORD}\nOLD_BUYER_ID=${oldBuyer}\nPRODUCT_ID=${a.id}\nVARIANT_ID=${a.variants[0].id}\nBRANCH_ID=${branchA}\nORDER_ID=${demo.id}\nSHIPMENT_ID=${demoShipment.id}\nCOUPON_CODE=${code}\nCAMPAIGN_ID=${campaign.id}\n`,{mode:0o600});
}catch(error){failure=error instanceof assert.AssertionError?"ASSERTION_FAILED":error.code??error.message;process.exitCode=1;const line=error.stack?.match(/verify-close-four-six\.mjs:(\d+):\d+/)?.[1];console.error("FAIL phase 4-6 integration after "+checks.length+" checks: "+failure+(line ? " at line "+line : "")+(typeof error.actual === "number" && typeof error.expected === "number" ? ` (actual ${error.actual}, expected ${error.expected})` : ""));}
finally{for(const service of stopped)try{docker("start",`${project}-${service}-1`);}catch{process.exitCode=1;}await Promise.all(Object.values(pools).map(pool=>pool.end()));writeFileSync("docs/verification-close-four-six.json",JSON.stringify({completedAt:new Date().toISOString(),project,universityScope:true,externalSmtpRequired:false,physicalPhoneGpsClaimed:false,passed:process.exitCode!==1,failure,checks,privacy:{credentialsIdentitiesPayloadsExcluded:true}},null,2)+"\n");}
