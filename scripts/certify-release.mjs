import {spawnSync} from "node:child_process";
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
const checks=[];
for(const [command,...args] of commands){const start=Date.now();const result=spawnSync(process.platform==="win32"&&command==="npx"?"cmd.exe":command,process.platform==="win32"&&command==="npx"?["/d","/s","/c",[command,...args].join(" ")]:args,{stdio:"inherit",windowsHide:true,timeout:40*60*1000});checks.push({command:[command,...args].join(" "),passed:result.status===0,milliseconds:Date.now()-start});if(result.status!==0)break;}
const passed=checks.length===commands.length&&checks.every(check=>check.passed);
writeFileSync("docs/verification-ci-gate.json",JSON.stringify({completedAt:new Date().toISOString(),passed,environment:process.env.GITHUB_ACTIONS==="true"?"GitHub Actions":"local",gitSha:process.env.GITHUB_SHA??null,pipelineSha256:createHash("sha256").update(readFileSync(import.meta.filename)).digest("hex"),stabilityIncluded:!process.argv.includes("--skip-stability"),checks,secretsExcluded:true},null,2)+"\n");
if(!passed)process.exitCode=1;
