import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";

const execute = promisify(execFile), allProjects = ["web", ...["auth", "catalog", "inventory", "pricing", "orders", "realtime", "analytics", "logistics", "crm", "notification"]];
const selectedAt=process.argv.indexOf("--project"), selected=selectedAt<0?null:process.argv[selectedAt+1];
if(selected&&!allProjects.includes(selected))throw Error("UNKNOWN_PROJECT");
const webOnly = process.argv.includes("--web-only"), projects = selected ? [selected] : webOnly ? ["web"] : allProjects;
const earlier = webOnly || selected ? JSON.parse(readFileSync("docs/verification-release-quality.json", "utf8")) : null;
const results = earlier ? earlier.results.filter(result => !projects.includes(result.project)).map(result => ({ ...result, verifiedAt: result.verifiedAt ?? earlier.completedAt })) : [];
let cursor = 0;
async function worker() {
  while (cursor < projects.length) {
    const project = projects[cursor++], cwd = project === "web" ? process.cwd() : `${process.cwd()}/services/${project}-service`;
    const commands = ["run lint" + (project === "web" ? " -- src tests scripts e2e playwright.accounts.config.ts playwright.phases-four-six.config.ts playwright.phases-seven.config.ts playwright.principal.config.ts" : ""), "run typecheck", "test", "run build"];
    const checks = [];
    for (const command of commands) {
      try {
        const { stdout } = await execute(process.platform === "win32" ? "cmd.exe" : "npm", process.platform === "win32" ? ["/d", "/s", "/c", "npm " + command] : command.split(" "), { cwd, windowsHide: true, timeout: 300000, maxBuffer: 8 * 1024 * 1024 });
        const output = stdout.replace(/\u001b\[[0-9;]*m/g, "");
        const counts = [...output.matchAll(/Tests\s+(\d+) passed|(?:# |ℹ )tests (\d+)/g)].map(match => Number(match[1] ?? match[2]));
        checks.push({ command, passed: true, ...(command === "test" ? { testCount: counts.reduce((a, b) => a + b, 0) } : {}) });
      } catch {
        checks.push({ command, passed: false }); process.exitCode = 1;
        console.error(`FAIL ${project} ${command}`); break;
      }
    }
    results.push({ project, verifiedAt: new Date().toISOString(), checks, passed: checks.length === 4 && checks.every(check => check.passed) });
    console.log(`${checks.every(check => check.passed) ? "PASS" : "FAIL"} quality ${project}`);
  }
}
await Promise.all([worker(), worker()]);
results.sort((a, b) => allProjects.indexOf(a.project) - allProjects.indexOf(b.project));
writeFileSync("docs/verification-release-quality.json", JSON.stringify({ completedAt: new Date().toISOString(), passed: results.length === 11 && results.every(result => result.passed), testCount: results.flatMap(result => result.checks).reduce((sum, check) => sum + (check.testCount ?? 0), 0), results }, null, 2) + "\n");
