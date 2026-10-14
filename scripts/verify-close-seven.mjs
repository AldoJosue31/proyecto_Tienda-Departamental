import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {writeFileSync} from "node:fs";
import {api,login,pool,transactionDatabase,docker,project,until,pause} from "./release-test-support.mjs";

const checks=[],stopped=new Set(),inventory=pool("inventory"),orders=pool("orders"),logistics=pool("logistics"),auth=pool("auth");
const load=createRequire(new URL("../services/logistics-service/package.json",import.meta.url));
const {ShipmentsService}=load("./dist/shipments/shipments.service.js");
const localLogistics=new ShipmentsService(transactionDatabase(logistics),{enqueue:async()=>{}});
const check=async(name,operation)=>{const start=Date.now();const detail=await operation();checks.push({name,passed:true,milliseconds:Date.now()-start,...detail});console.log("PASS "+name);};
function stop(service){docker("stop",`${project}-${service}-1`);stopped.add(service);}
function start(service){docker("start",`${project}-${service}-1`);stopped.delete(service);}
let failure,fixture;
try{
 const admin=await login("admin"),employee=await login("employee"),customer=await login("customer"),suffix=randomUUID().slice(0,8);
 const branches=(await api("/inventory/branches",{token:admin.accessToken})).body.branches;
 const created=await api("/products",{token:admin.accessToken,method:"POST",body:{name:`Cierre Prenda ${suffix}`,category:{name:"Cierre Moda"},brand:{name:"Universidad"},description:"Prenda sintética de certificación, sin mercancía real."}});assert.equal(created.status,201);
 const product=created.body.product,variants=[];
 for(const size of ["S","M","L"])for(const color of ["Azul","Negro"])for(const material of ["Algodón","Lino"]){const r=await api(`/products/${product.id}/variants`,{token:admin.accessToken,method:"POST",body:{sku:`C7-${suffix}-${size}-${color[0]}-${material[0]}`,size,color,material,listPrice:137,currency:"MXN"}});assert.equal(r.status,201);variants.push(r.body.variant);}
 const movement=async(variant,branchId,quantity,type="RECEIPT",reorderPoint=2)=>{const r=await api("/inventory/movements",{token:admin.accessToken,method:"POST",body:{variantId:variant.id,branchId,type,quantity,reorderPoint,catalogSnapshot:{productName:product.name,sku:variant.sku,variantLabel:variant.label}}});assert.equal(r.status,201);return r.body;};
 const stock=async(variant,branchId)=>(await inventory.query("SELECT on_hand,reserved,revision FROM inventory_stock WHERE variant_id=$1 AND branch_id=$2",[variant.id,branchId])).rows[0];
 const sale=async(actor,variant,channel="PHYSICAL",branchId=branches[0].id)=>api("/orders",{token:actor.accessToken,method:"POST",headers:{"Idempotency-Key":randomUUID()},body:{branchId,channel,...(channel==="PHYSICAL"?{customerId:customer.user.id}:{}),items:[{productId:product.id,variantId:variant.id,quantity:1}]}});
 await check("12 independent size/color/material SKUs with branch-specific stock and inclusive reorder alerts",async()=>{
  for(const variant of variants){await movement(variant,branches[0].id,1);await movement(variant,branches[1].id,7);}
  const r=await api(`/inventory/branches/${branches[0].id}`,{token:admin.accessToken});assert.equal(r.status,200);
  for(const variant of variants){const item=r.body.items.find(item=>item.variantId===variant.id);assert.equal(item.available,1);assert.equal(item.reorderPoint,2);assert.ok(item.available<=item.reorderPoint);assert.equal((await stock(variant,branches[1].id)).on_hand,7);}
  const low=await api("/inventory/low-stock",{token:admin.accessToken});assert.equal(low.status,200);for(const variant of variants)assert.ok(low.body.items.some(item=>item.variantId===variant.id&&item.branch.id===branches[0].id));return {variants:variants.length,branches:2};
 });
 await check("six physical/physical last-unit races confirm exactly once in real PostgreSQL",async()=>{
  for(const variant of variants.slice(0,6)){const r=await Promise.all([sale(admin,variant),sale(employee,variant)]);assert.equal(r.filter(r=>r.status===201&&r.body.order.status==="CONFIRMED").length,1);assert.ok(r.some(r=>r.status===409));const current=await stock(variant,branches[0].id);assert.equal(current.on_hand,0);assert.equal(current.reserved,0);}
  return {races:6,confirmedSales:6};
 });
 await check("six physical/online last-unit races confirm exactly once with no negative stock",async()=>{
  for(const variant of variants.slice(6)){const r=await Promise.all([sale(employee,variant),sale(customer,variant,"ONLINE")]);assert.equal(r.filter(r=>r.status===201&&r.body.order.status==="CONFIRMED").length,1);assert.ok(r.some(r=>r.status===409));const current=await stock(variant,branches[0].id);assert.equal(current.on_hand,0);assert.equal(current.reserved,0);}
  return {races:6,confirmedSales:6};
 });
 await check("Redis HIT serves the same search with Catalog PostgreSQL stopped, then TTL expires",async()=>{
  const route="/products?search="+encodeURIComponent(product.name),warm=await api(route);assert.equal(warm.status,200);assert.equal(warm.body.items[0].id,product.id);
  const keys=docker("exec",`${project}-catalog-redis-1`,"redis-cli","--scan","--pattern","catalog:search:*").split(/\r?\n/).filter(Boolean);
  const key=keys.find(key=>{try{return JSON.parse(docker("exec",`${project}-catalog-redis-1`,"redis-cli","--raw","GET",key)).items?.length===warm.body.items.length && JSON.parse(docker("exec",`${project}-catalog-redis-1`,"redis-cli","--raw","GET",key)).items?.[0]?.id===product.id;}catch{return false;}});assert.ok(key);
  const ttl=Number(docker("exec",`${project}-catalog-redis-1`,"redis-cli","TTL",key));assert.ok(ttl>0);
  stop("catalog-postgres");try{const hit=await api(route);assert.equal(hit.status,200);assert.deepEqual(hit.body,warm.body);docker("exec",`${project}-catalog-redis-1`,"redis-cli","EXPIRE",key,"1");await pause(1200);assert.equal(docker("exec",`${project}-catalog-redis-1`,"redis-cli","EXISTS",key),"0");assert.equal((await api(route)).status,503);}finally{start("catalog-postgres");}
  await until(async()=>(await api(route)).status===200);return {ttlSeconds:ttl,postgresUnavailableDuringHit:true};
 });
 await check("Catalog edit invalidates cached variants and Redis outage falls back to PostgreSQL",async()=>{
  const before=await api("/products?search="+encodeURIComponent(product.name));assert.equal(before.status,200);
  const changed=await api(`/variants/${variants[0].id}`,{token:admin.accessToken,method:"PATCH",body:{listPrice:139}});assert.equal(changed.status,200);
  const after=await api("/products?search="+encodeURIComponent(product.name));assert.equal(after.body.items[0].variants.find(v=>v.id===variants[0].id).listPrice,139);
  stop("catalog-redis");try{const fallback=await api("/products?search="+encodeURIComponent(product.name));assert.equal(fallback.status,200);assert.equal(fallback.body.items[0].id,product.id);assert.equal((await api(`/variants/${variants[0].id}`,{token:admin.accessToken,method:"PATCH",body:{listPrice:141}})).status,200);}finally{start("catalog-redis");}
  await until(async()=>JSON.parse(docker("inspect",`${project}-catalog-redis-1`))[0].State.Health?.Status==="healthy");
  await until(async()=>JSON.parse(docker("exec",`${project}-servicio-catalogo-1`,"node","-e","fetch('http://127.0.0.1:3002/health').then(r=>r.json()).then(r=>console.log(JSON.stringify(r)))")).cache==="ready");
  const recovered=await api("/products?search="+encodeURIComponent(product.name));assert.equal(recovered.status,200);assert.equal(recovered.body.items[0].variants.find(v=>v.id===variants[0].id).listPrice,141);
 });
 await check("cancellation before the delayed Logistics projection cannot later be dispatched or restore twice",async()=>{
  stop("rabbitmq");let order;
  try{const r=await sale(customer,variants[1],"ONLINE",branches[1].id);assert.equal(r.status,201);order=r.body.order;assert.equal((await logistics.query("SELECT id FROM logistics_shipments WHERE order_id=$1",[order.id])).rowCount,0);
   const cancelled=await api(`/orders/${order.id}/cancel`,{token:customer.accessToken,method:"POST",body:{reason:"Certificación de proyección tardía"}});assert.equal(cancelled.body.order.status,"CANCELLED");assert.equal((await logistics.query("SELECT order_id FROM logistics_cancelled_orders WHERE order_id=$1",[order.id])).rowCount,1);
  }finally{start("rabbitmq");}
  await until(async()=>JSON.parse(docker("inspect",`${project}-rabbitmq-1`))[0].State.Health?.Status==="healthy",180000);
  const shipment=await until(async()=>(await logistics.query("SELECT * FROM logistics_shipments WHERE order_id=$1",[order.id])).rows[0],120000);assert.equal(shipment.status,"CANCELLED");
  assert.equal((await api(`/shipments/${shipment.id}/status`,{token:admin.accessToken,method:"PATCH",body:{status:"PACKING",version:shipment.version}})).status,409);
  await until(async()=>(await stock(variants[1],branches[1].id)).on_hand===7);
  await api(`/orders/${order.id}/cancel`,{token:customer.accessToken,method:"POST",body:{}});await pause(1000);assert.equal((await stock(variants[1],branches[1].id)).on_hand,7);
 });
 await check("the absent-shipment cancellation and late completion share a transaction lock",async()=>{
  const orderId=randomUUID(),client=await logistics.connect();await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["logistics:order:"+orderId]);
  let settled=false;const pending=localLogistics.project({eventId:randomUUID(),eventType:"order.completed.v1",occurredAt:new Date().toISOString(),correlationId:null,orderId:orderId.toUpperCase(),customerId:customer.user.id,branchId:branches[0].id,channel:"ONLINE",currency:"MXN",total:137,items:[]}).then(()=>{settled=true;});
  try{await pause(200);assert.equal(settled,false);await client.query("INSERT INTO logistics_cancelled_orders(order_id,cancelled_at) VALUES($1,NOW())",[orderId]);await client.query("COMMIT");await pending;}finally{await client.query("ROLLBACK");client.release();}
  assert.equal((await logistics.query("SELECT status FROM logistics_shipments WHERE order_id=$1",[orderId])).rows[0].status,"CANCELLED");
 });
 await check("dispatch/cancel races leave stock consistent with the winner",async()=>{
  for(let attempt=0;attempt<4;attempt++){const r=await sale(customer,variants[2],"ONLINE",branches[1].id);assert.equal(r.status,201);const order=r.body.order;
   let ship=await until(async()=>(await api("/shipments",{token:admin.accessToken})).body.shipments.find(s=>s.orderId===order.id));
   ship=(await api(`/shipments/${ship.id}/tracking`,{token:admin.accessToken,method:"PATCH",body:{courierId:employee.user.id,courierName:employee.user.name,deliveryAddress:"Destino ficticio de certificación",version:ship.version}})).body.shipment;
   ship=(await api(`/shipments/${ship.id}/status`,{token:admin.accessToken,method:"PATCH",body:{status:"PACKING",version:ship.version}})).body.shipment;
   const before=(await stock(variants[2],branches[1].id)).on_hand;
   const outcomes=await Promise.all([api(`/shipments/${ship.id}/status`,{token:admin.accessToken,method:"PATCH",body:{status:"SHIPPED",version:ship.version}}),api(`/orders/${order.id}/cancel`,{token:customer.accessToken,method:"POST",body:{}})]);
   const official=(await orders.query("SELECT status FROM orders WHERE id=$1",[order.id])).rows[0].status;
   if(official==="CANCELLED"){assert.ok(outcomes[0].status===409);await until(async()=>(await stock(variants[2],branches[1].id)).on_hand===before+1);}else{assert.equal(official,"CONFIRMED");assert.equal(outcomes[1].status,409);await pause(500);assert.equal((await stock(variants[2],branches[1].id)).on_hand,before);}
  }return {races:4};
 });
 await check("Realtime can stop while sales continue, then reconnects to the official stock snapshot",async()=>{
  const before=(await stock(variants[4],branches[1].id)).on_hand;
  stop("servicio-tiempo-real");try{assert.equal((await sale(employee,variants[4],"PHYSICAL",branches[1].id)).status,201);assert.equal((await api("/products")).status,200);assert.equal((await stock(variants[4],branches[1].id)).on_hand,before-1);}finally{start("servicio-tiempo-real");}
  await until(async()=>JSON.parse(docker("inspect",`${project}-servicio-tiempo-real-1`))[0].State.Health?.Status==="healthy");
  const snapshot=await api(`/inventory/branches/${branches[1].id}`,{token:admin.accessToken});assert.equal(snapshot.body.items.find(item=>item.variantId===variants[4].id).available,before-1);
 });
 // Stock reserved for complete browser flows. No direct SQL inventory edits.
 for(const variant of variants)await movement(variant,branches[0].id,20);
 const otherCustomerId=randomUUID(),otherCustomerEmail=`c7-customer-${otherCustomerId.slice(0,12)}@example.test`;
 await auth.query("INSERT INTO auth_users(id,email,name,password_hash,role,is_active,onboarding_status,email_verified_at,verification_source) SELECT $1,$2,'Cliente sintético de aislamiento de bolsa',password_hash,'CUSTOMER',TRUE,'READY',NOW(),'TEST_FIXTURE' FROM auth_users WHERE email='customer@departamental.local'",[otherCustomerId,otherCustomerEmail]);
 fixture={product,variants,branches:branches.slice(0,2),otherCustomerEmail};writeFileSync(".env.phase-seven-fixture",JSON.stringify(fixture),{mode:0o600});
}catch(error){failure=error;console.error("FAIL phase seven verification");}
finally{for(const service of stopped)try{start(service);}catch{failure??=Error("DEPENDENCY_RESTART_FAILED");}await Promise.all([inventory.end(),orders.end(),logistics.end(),auth.end()]);writeFileSync("docs/verification-close-seven.json",JSON.stringify({completedAt:new Date().toISOString(),project,passed:!failure,checks,scope:"Real isolated PostgreSQL, Redis and API races; synthetic inventory only",secretsExcluded:true},null,2)+"\n");}
if(failure)throw failure;
