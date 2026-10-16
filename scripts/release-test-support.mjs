import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import pg from "pg";

export const project="departamental-five-phases", gateway="http://localhost:8005", web="http://localhost:3105";
export const env=Object.fromEntries(readFileSync(".env.integration","utf8").split(/\r?\n/).filter(line=>line&&!line.startsWith("#")).map(line=>{const at=line.indexOf("=");return[line.slice(0,at),line.slice(at+1).replace(/^(['"])(.*)\1$/,"$2")];}));
assert.equal(env.COMPOSE_PROJECT_NAME,project);
export const docker=(...args)=>execFileSync("docker",args,{encoding:"utf8",timeout:60000,maxBuffer:8*1024*1024,stdio:["ignore","pipe","pipe"]}).trim();
export const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function until(operation,timeout=65000){const start=Date.now();while(Date.now()-start<timeout){try{const result=await operation();if(result)return result;}catch{/* dependency or projection is recovering */}await pause(300);}throw Error("EXPECTED_STATE_NOT_REACHED");}
/** @param {string} route @param {{token?:string,body?:object,method?:string,headers?:Record<string,string>,base?:string}} options */
export async function api(route,{token,body,method="GET",headers={},base=gateway}={}){
  const response=await fetch(base+route,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{"Content-Type":"application/json"}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  return {status:response.status,body:await response.json().catch(()=>null)};
}
export async function login(role){const r=await api("/auth/login",{method:"POST",body:{email:`${role}@departamental.local`,password:env[`SEED_${role.toUpperCase()}_PASSWORD`]}});assert.equal(r.status,200);return r.body;}
const ports={auth:55431,inventory:55433,orders:55435,logistics:55438,pricing:55434,analytics:55437,notification:55440,crm:55439};
export function pool(domain){const state=JSON.parse(docker("inspect",`${project}-${domain}-postgres-1`))[0];assert.equal(state.Config.Labels["com.docker.compose.project"],project);return new pg.Pool({host:"127.0.0.1",port:ports[domain],database:domain+"_service",user:domain+"_service",password:env[domain.toUpperCase()+"_DB_PASSWORD"]});}
export function transactionDatabase(pool){return {query:(sql,values)=>pool.query(sql,values),withTransaction:async operation=>{const client=await pool.connect();try{await client.query("BEGIN");const result=await operation(client);await client.query("COMMIT");return result;}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}};}
