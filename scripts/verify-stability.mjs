import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import {api,login,docker,project,web,pool,pause} from "./release-test-support.mjs";

// The certification always runs for at least 30 minutes; there is no shorter
// mode that could silently be substituted for the release gate.
const duration=30*60*1000,interval=10000,started=Date.now(),samples=[],health=[],pools={};
const names=docker("ps","-q","--filter",`label=com.docker.compose.project=${project}`).split(/\s+/).filter(Boolean);
const imageSet=names.map(id=>{const state=JSON.parse(docker("inspect",id))[0];return{service:state.Config.Labels["com.docker.compose.service"],imageId:state.Image};}).sort((a,b)=>a.service.localeCompare(b.service));
assert.equal(imageSet.length,24);
for(const domain of ["inventory","orders","analytics","crm","notification","logistics"])pools[domain]=pool(domain);
let failure,admin=await login("admin"),lastLogin=Date.now(),round=0;
try{
 const branch=(await api("/inventory/branches",{token:admin.accessToken})).body.branches[0].id;
 while(Date.now()-started<duration){const cycle=Date.now();
  if(Date.now()-lastLogin>5*60*1000){admin=await login("admin");lastLogin=Date.now();}
  const routes=["/products?search=azul","/products?pageSize=20",`/inventory/branches/${branch}`,"/shipments","/analytics/sales/by-branch?period=today"];
  const results=await Promise.all(routes.map(async route=>{const at=Date.now();try{const r=await api(route,{token:admin.accessToken});return {route,status:r.status,milliseconds:Date.now()-at,passed:r.status===200};}catch{return{route,status:0,milliseconds:Date.now()-at,passed:false};}}));
  const at=Date.now();try{const r=await fetch(web+"/",{signal:AbortSignal.timeout(20000)});results.push({route:"web/catalog",status:r.status,milliseconds:Date.now()-at,passed:r.status===200});await r.text();}catch{results.push({route:"web/catalog",status:0,milliseconds:Date.now()-at,passed:false});}
  samples.push(...results.map(result=>({...result,round})));assert.ok(results.every(result=>result.passed),"READ_LOAD_FAILED");
  if(round%6===0){const containers=imageSet.map(({service,imageId})=>{const state=JSON.parse(docker("inspect",`${project}-${service}-1`))[0];return{service,passed:state.Image===imageId&&state.State.Running&&(!state.State.Health||state.State.Health.Status==="healthy"),restarts:state.RestartCount};});assert.ok(containers.every(item=>item.passed),"HEALTH_OR_IMAGE_CHANGED");
   const pending={};for(const [domain,pool] of Object.entries(pools)){if(domain==="analytics"){pending.analyticsCompletedProjections=Number((await pool.query("SELECT COUNT(*)::int AS n FROM analytics_order_projection WHERE status='COMPLETED'")).rows[0].n);continue;}const table=domain==="orders"?"orders_outbox_events":domain+"_outbox_events";pending[domain]=Number((await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE published_at IS NULL`)).rows[0].n);if(domain==="notification")pending.onboardingNotifications=Number((await pool.query("SELECT COUNT(*)::int AS n FROM notification_onboarding_outbox_events WHERE published_at IS NULL")).rows[0].n);}
   health.push({elapsedMilliseconds:Date.now()-started,containers,pending});console.log(`PASS stability minute ${Math.floor((Date.now()-started)/60000)}, requests ${samples.length}`);
  }
  round++;await pause(Math.min(Math.max(0,interval-(Date.now()-cycle)),Math.max(0,duration-(Date.now()-started))));
 }
}catch(error){failure=error;console.error("FAIL stability certification");}
finally{await Promise.all(Object.values(pools).map(pool=>pool.end()));const times=samples.map(s=>s.milliseconds).sort((a,b)=>a-b);writeFileSync("docs/verification-stability.json",JSON.stringify({startedAt:new Date(started).toISOString(),completedAt:new Date().toISOString(),elapsedMilliseconds:Date.now()-started,minimumDurationMilliseconds:duration,project,imageSet,passed:!failure&&Date.now()-started>=duration,load:{concurrency:5,webRequestsPerRound:1,intervalMilliseconds:interval,rounds:round,requests:samples.length,errors:samples.filter(s=>!s.passed).length,p95Milliseconds:times[Math.max(0,Math.ceil(times.length*0.95)-1)]},samples,health,scope:"Read workload on healthy local isolated Docker; no universal availability claim",secretsExcluded:true},null,2)+"\n");}
if(failure)throw failure;
