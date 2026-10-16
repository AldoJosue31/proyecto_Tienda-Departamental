import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {writeFileSync} from "node:fs";
const execute=promisify(execFile),projects=["web",..."auth catalog inventory pricing orders realtime analytics logistics crm notification".split(" ")],checks=[];
let cursor=0;
async function worker(){while(cursor<projects.length){const project=projects[cursor++],cwd=project==="web"?process.cwd():`${process.cwd()}/services/${project}-service`;let output;
 try{output=(await execute(process.platform==="win32"?"cmd.exe":"npm",process.platform==="win32"?["/d","/s","/c","npm audit --omit=dev --json"]:["audit","--omit=dev","--json"],{cwd,windowsHide:true,timeout:120000,maxBuffer:8*1024*1024})).stdout;}catch(error){output=error.stdout;}
 const report=JSON.parse(output||"{}");const counts=report.metadata?.vulnerabilities;const passed=Boolean(counts&&counts.high===0&&counts.critical===0);checks.push({project,passed,counts:counts??null});console.log(`${passed?"PASS":"FAIL"} production dependency audit ${project}`);
}}
await Promise.all([worker(),worker()]);const passed=checks.length===11&&checks.every(check=>check.passed);writeFileSync("docs/verification-dependency-security.json",JSON.stringify({completedAt:new Date().toISOString(),passed,scope:"Production dependency graph in eleven projects; rejects high and critical",checks,developmentToolingAdvisory:{id:"GHSA-vfj7-8cjw-p6xm",url:"https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",rootDevOnly:true,patchedVersionAvailable:false,handling:"Production images omit dev dependencies. CI lint uses fixed repository patterns; no user glob input is accepted. This remains an upstream development-tool advisory, not a claim of zero findings in npm audit including dev dependencies."}},null,2)+"\n");if(!passed)process.exitCode=1;
