import {spawnSync,execFileSync} from "node:child_process";
import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";

// One sequential gate is shared by local certification and GitHub Actions.
// No faults or fixture mutations can overlap between these runners.
const commands=[
 ["node","scripts/verify-close-first-three.mjs"],
 ["node","scripts/verify-accounts-first-five.mjs"],
 ["node","scripts/verify-five-phases.mjs"],
 ["node","scripts/verify-final-phases.mjs"],
 ["npx","playwright","test","--config","playwright.accounts.config.ts"],
 ["node","scripts/verify-accounts-races.mjs"],
 ["node","scripts/audit-requirements.mjs"],
 ["node","scripts/audit-projection-dlq.mjs","--recover-valid"],
 ["node","scripts/audit-domain-dlq.mjs","--recover-valid"],
 ["node","scripts/verify-close-four-six.mjs"],
 ["npx","playwright","test","--config","playwright.phases-four-six.config.ts"],
 ["node","scripts/verify-close-seven.mjs"],
 ["npx","playwright","test","--config","playwright.phases-seven.config.ts"],
];
if(!process.argv.includes("--skip-stability"))commands.push(["node","scripts/verify-stability.mjs"]);
const checks=[],fixtureInitializations=[];
function initializeAccountFixture(){
 const container="departamental-five-phases-auth-postgres-1";
 const run=args=>execFileSync("docker",args,{encoding:"utf8",timeout:20000,stdio:["ignore","pipe","pipe"]}).trim();
 const state=JSON.parse(run(["inspect",container]))[0];
 assert.equal(state.Config.Labels["com.docker.compose.project"],"departamental-five-phases");
 assert.ok(state.NetworkSettings.Ports["5432/tcp"].every(port=>port.HostIp==="127.0.0.1"&&port.HostPort==="55431"));
 // Different account suites share a loopback IP, so initialize only the
 // disposable IP counter fixture. Atomicity and restart persistence are
 // tested inside the suite without clearing counters during those assertions.
 run(["exec",container,"psql","-U","auth_service","-d","auth_service","-v","ON_ERROR_STOP=1","-c", "DELETE FROM auth_onboarding_rate_limits WHERE scope='IP';"]);
 fixtureInitializations.push({project:"departamental-five-phases",fixture:"account-suite IP counters",at:new Date().toISOString()});
}
const quotaBoundarySuites=new Set(["scripts/verify-close-four-six.mjs","playwright.phases-four-six.config.ts","scripts/verify-close-seven.mjs","playwright.phases-seven.config.ts","scripts/verify-stability.mjs"]);
for(const [command,...args] of commands){if(args.some(arg=>quotaBoundarySuites.has(arg))){console.log("WAIT independent suite respects the Gateway login quota window");await new Promise(resolve=>setTimeout(resolve,61000));}if(args.includes("scripts/verify-accounts-first-five.mjs")||args.includes("playwright.accounts.config.ts"))initializeAccountFixture();const start=Date.now();const result=spawnSync(process.platform==="win32"&&command==="npx"?"cmd.exe":command,process.platform==="win32"&&command==="npx"?["/d","/s","/c",[command,...args].join(" ")]:args,{stdio:"inherit",windowsHide:true,timeout:40*60*1000});checks.push({command:[command,...args].join(" "),passed:result.status===0,milliseconds:Date.now()-start});if(result.status!==0)break;}
const passed=checks.length===commands.length&&checks.every(check=>check.passed);
writeFileSync("docs/verification-ci-gate.json",JSON.stringify({completedAt:new Date().toISOString(),passed,environment:process.env.GITHUB_ACTIONS==="true"?"GitHub Actions":"local",gitSha:process.env.GITHUB_SHA??null,pipelineSha256:createHash("sha256").update(readFileSync(import.meta.filename)).digest("hex"),stabilityIncluded:!process.argv.includes("--skip-stability"),fixtureInitializations,checks,secretsExcluded:true},null,2)+"\n");
if(!passed)process.exitCode=1;
