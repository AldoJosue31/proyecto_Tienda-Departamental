import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync,existsSync} from "node:fs";
import path from "node:path";

const release=JSON.parse(readFileSync("docs/release-fases-7-9.json","utf8"));
const backup=JSON.parse(readFileSync("docs/verification-release-web.json","utf8"));
const rehearsal=JSON.parse(readFileSync("docs/verification-release-images-fases-7-9.json","utf8"));
const stability=JSON.parse(readFileSync("docs/verification-stability.json","utf8"));
const quality=JSON.parse(readFileSync("docs/verification-release-quality.json","utf8"));
const ci=JSON.parse(readFileSync("docs/verification-remote-ci.json","utf8"));
const gate=JSON.parse(readFileSync("docs/verification-ci-gate.json","utf8"));
const archive=JSON.parse(readFileSync("docs/verification-release-archive-fases-7-9.json","utf8"));
const run=(args,input)=>execFileSync("docker",args,{input,encoding:"utf8",timeout:180000,maxBuffer:64*1024*1024,stdio:["pipe","pipe","pipe"]}).trim();
const inspect=name=>JSON.parse(run(["inspect",name]))[0],sha=value=>createHash("sha256").update(value).digest("hex");
const privateRoot=path.resolve("../.codex-backups/integral-release"),directory=path.resolve(backup.backupDirectory);
assert.ok(directory.toLowerCase().startsWith(privateRoot.toLowerCase()+path.sep));
assert.ok(backup.passed&&backup.writersHeldForDeployment&&Date.now()-Date.parse(backup.completedAt)<20*60*1000,"FRESH_HELD_CHECKPOINT_REQUIRED");
assert.ok(rehearsal.passed&&quality.passed&&stability.passed&&stability.elapsedMilliseconds>=1800000&&archive.passed,"CERTIFICATION_REQUIRED");
assert.equal(rehearsal.releaseId,release.releaseId);assert.equal(archive.releaseId,release.releaseId);
for(const input of release.inputs)assert.equal(existsSync(input.file)?sha(readFileSync(input.file)):"DELETED",input.sha256,"FROZEN_SOURCE_CHANGED");
assert.ok(gate.passed&&gate.stabilityIncluded&&ci.passed&&ci.gitSha===release.gitHead,"SAME_VERSION_CI_REQUIRED");
const owners={auth:"servicio-autenticacion",catalog:"servicio-catalogo",inventory:"servicio-inventario",pricing:"servicio-precios",orders:"servicio-pedidos",analytics:"servicio-analitica",logistics:"servicio-logistica",crm:"servicio-clientes",notification:"servicio-notificaciones"};
for(const check of rehearsal.checks)assert.equal(check.imageId,release.images.find(item=>item.service===owners[check.domain]).imageId);
for(const item of stability.imageSet)assert.equal(item.imageId,release.images.find(image=>image.service===item.service).imageId);
for(const item of backup.images)assert.equal(inspect(`web-${item.service}-1`).Image,item.imageId,"PRINCIPAL_CHANGED_AFTER_CHECKPOINT");
for(const id of backup.heldContainers)assert.equal(inspect(id).State.Running,false,"WRITER_RESUMED_AFTER_CHECKPOINT");
const broker=inspect("web-rabbitmq-1"),runtime=path.join(directory,"compose.destination.yaml");
let destinationEnv=readFileSync(".env","utf8");const hostnameLine="RABBITMQ_HOSTNAME="+broker.Config.Hostname;if(/^RABBITMQ_HOSTNAME=.*$/m.test(destinationEnv))destinationEnv=destinationEnv.replace(/^RABBITMQ_HOSTNAME=.*$/m,hostnameLine);else destinationEnv+="\n"+hostnameLine+"\n";writeFileSync(".env",destinationEnv,{mode:0o600});writeFileSync(path.join(directory,"environment.destination.private"),destinationEnv,{mode:0o600});
// Retain Rabbit's existing node identity when the compatible Compose recreates
// its container. The durable volume and its pending jobs stay attached.
writeFileSync(runtime,`services:\n  rabbitmq:\n    hostname: ${JSON.stringify(broker.Config.Hostname)}\n  smtp-capture:\n    image: ${release.images.find(image=>image.service==="smtp-capture").imageId}\n    pull_policy: never\n`,{mode:0o600});
const compose=["compose","-p","web","--env-file",".env","-f","compose.yaml","-f","compose.university.yaml","-f","compose.release-fases-7-9.yaml","-f",runtime];
run([...compose,"config","--quiet"]);
const checks=[],before=[];
const sql=(domain,statement)=>run(["exec","-i",`web-${domain}-postgres-1`,"psql","-U",domain+"_service","-d",domain+"_service","-At","-v","ON_ERROR_STOP=1"],statement);
let failure;
try{
 for(const [domain,owner] of Object.entries(owners)){
  const tables=sql(domain,"SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '%schema_migrations' ORDER BY tablename;").split("\n").filter(Boolean);
  for(const table of tables){assert.match(table,/^[a-z0-9_]+$/);const exclude=domain==="auth"&&table==="auth_users"?" AND column_name<>'updated_at'":"";const columns=sql(domain,`SELECT string_agg(quote_ident(column_name),',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}'${exclude}`);const statement=`SELECT COALESCE(jsonb_agg(row ORDER BY row::text),'[]'::jsonb) FROM (SELECT ${columns} FROM "${table}") row;`;before.push({domain,table,statement,sha256:sha(sql(domain,statement))});}
  const previous=inspect(`web-${owner}-1`);const databaseUrl=previous.Config.Env.find(value=>value.startsWith("DATABASE_URL="))?.slice(13);assert.ok(databaseUrl);const url=new URL(databaseUrl);url.hostname="127.0.0.1";url.port="5432";
  const image=release.images.find(image=>image.service===owner).imageId;
  run(["run","--rm","--read-only","--network",`container:web-${domain}-postgres-1`,"--entrypoint","node","-e","DATABASE_URL="+url.href,"-e","DATABASE_SSL=false",image,"dist/database/migrate.js"]);
  for(const item of before.filter(item=>item.domain===domain))assert.equal(sha(sql(domain,item.statement)),item.sha256,"PREEXISTING_DATA_CHANGED");
  checks.push({name:domain+" migrations preserve preexisting columns and rows",tables:tables.length,passed:true});console.log("PASS principal migration "+domain);
 }
 writeFileSync(path.join(directory,"preservation.private.json"),JSON.stringify(before,null,2),{mode:0o600});
 const infrastructure=release.images.filter(item=>!item.service.startsWith("servicio-")&&!['pasarela-api','aplicacion-web'].includes(item.service)).map(item=>item.service);
 run([...compose,"up","-d","--no-build","--wait","--wait-timeout","150",...infrastructure]);
 const checkpoint=JSON.parse(run(["exec","web-rabbitmq-1","rabbitmqctl","list_queues","--formatter","json","name","messages"]));
 for(const queue of backup.brokerCheckpoint)assert.ok(checkpoint.some(item=>item.name===queue.name&&item.messages===queue.messages),"PENDING_BROKER_JOB_CHANGED");
 checks.push({name:"original Rabbit node, durable queues and pending counts preserved before consumers restart",passed:true});
 run([...compose,"up","-d","--no-build","--wait","--wait-timeout","150",...Object.values(owners),"servicio-tiempo-real","pasarela-api","aplicacion-web"]);
 // Preserve the legacy volumes and containers, outside the active runtime.
 for(const service of ["postgres","redis"])if(existsSync(path.join(directory,"legacy.dump"))||backup.images.some(item=>item.service===service)){const state=inspect(`web-${service}-1`);if(state.State.Running)run(["stop",state.Id]);}
 for(const image of release.images){const state=inspect(`web-${image.service}-1`);assert.equal(state.Image,image.imageId);assert.ok(state.State.Running&&(!state.State.Health||state.State.Health.Status==="healthy"));}
 checks.push({name:"24 principal containers run the exact certified images",passed:true});console.log("PASS exact principal release");
}catch(error){failure=error;writeFileSync(path.join(directory,"deployment-failure.private.txt"),String(error.stderr??error),{mode:0o600});console.error("DEPLOYMENT_FAILED; coordinated checkpoint retained. Do not discard newer writes when recovering.");}
writeFileSync("docs/verification-principal-deployment.json",JSON.stringify({completedAt:new Date().toISOString(),releaseId:release.releaseId,passed:!failure,checkpoint:directory,checks,images:release.images.map(({service,imageId})=>({service,imageId})),secretsExcluded:true},null,2)+"\n");if(failure)process.exitCode=1;
