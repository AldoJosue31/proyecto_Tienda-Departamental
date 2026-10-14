import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
const release=JSON.parse(readFileSync("docs/release-fases-7-9.json","utf8"));
for(const image of release.images){const state=JSON.parse(execFileSync("docker",["inspect",`web-${image.service}-1`],{encoding:"utf8"}))[0];assert.equal(state.Image,image.imageId);assert.ok(state.State.Running);}
const env=Object.fromEntries(readFileSync(".env","utf8").split(/\r?\n/).filter(line=>line&&!line.startsWith("#")).map(line=>{const at=line.indexOf("=");return[line.slice(0,at),line.slice(at+1).replace(/^(['"])(.*)\1$/,"$2")];}));
const api=async(route,options={})=>{const r=await fetch("http://localhost:8000"+route,{...options,signal:AbortSignal.timeout(20000)});assert.ok(r.ok,"PRINCIPAL_API_FAILED");return r.json();};
const session=await api("/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"admin@departamental.local",password:env.SEED_ADMIN_PASSWORD})});
const headers={Authorization:"Bearer "+session.accessToken,"Content-Type":"application/json"};
const branches=(await api("/inventory/branches",{headers})).branches,suffix=randomUUID().slice(0,8);
const product=(await api("/products",{method:"POST",headers,body:JSON.stringify({name:"Entrega universitaria "+suffix,category:{name:"Demostración universitaria"},brand:{name:"Universidad"},description:"Artículo ficticio designado para validar la entrega. Movimientos de demostración conservados en la auditoría."})})).product,variants=[];
for(const [size,color,material,price] of [["S","Azul","Algodón",120],["M","Negro","Lino",140],["L","Azul","Algodón",160]]){
 const variant=(await api(`/products/${product.id}/variants`,{method:"POST",headers,body:JSON.stringify({sku:`ENT-${suffix}-${size}`,size,color,material,listPrice:price,currency:"MXN"})})).variant;variants.push(variant);
 for(const branch of branches.slice(0,2))await api("/inventory/movements",{method:"POST",headers,body:JSON.stringify({variantId:variant.id,branchId:branch.id,type:"RECEIPT",quantity:10,reorderPoint:2,reason:"Fixture universitario designado de entrega",catalogSnapshot:{productName:product.name,sku:variant.sku,variantLabel:variant.label}})});
}
const employee=await api("/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"employee@departamental.local",password:env.SEED_EMPLOYEE_PASSWORD})});
// The old signup date is explicitly fictional. This test-only bootstrap writes
// within Auth's own container; normal CRM and web flows still use domain APIs.
const inactiveCustomerId=randomUUID(),inactiveCustomerEmail=`inactivo-${suffix}@example.test`;
const sql="INSERT INTO auth_users(id,email,name,password_hash,role,is_active,onboarding_status,email_verified_at,verification_source,created_at) SELECT '"+inactiveCustomerId+"','"+inactiveCustomerEmail+"','Cliente inactivo ficticio universitario',password_hash,'CUSTOMER',TRUE,'READY',NOW(),'TEST_FIXTURE','2025-01-01T12:00:00Z' FROM auth_users WHERE email='customer@departamental.local';";
execFileSync("docker",["exec","-i","web-auth-postgres-1","psql","-U","auth_service","-d","auth_service","-v","ON_ERROR_STOP=1"],{input:sql,encoding:"utf8",stdio:["pipe","pipe","pipe"]});
writeFileSync(".env.principal-fixture",JSON.stringify({releaseId:release.releaseId,product,variants,branches:branches.slice(0,2),employeeId:employee.user.id,inactiveCustomerId,inactiveCustomerEmail,couponCode:"ENTREGA-"+suffix.toUpperCase(),customerEmail:`entrega-${suffix}@example.test`,startedAt:new Date().toISOString()}),{mode:0o600});console.log("PASS designated university article and branch inventory prepared through owner APIs");
