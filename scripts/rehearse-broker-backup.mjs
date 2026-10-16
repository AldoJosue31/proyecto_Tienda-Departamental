import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Resume only the broker portion of an already quiesced backup rehearsal.
// No live containers, databases or queues are changed.
const project = process.argv.includes("--business") ? "web" : "departamental-five-phases";
const reportFile = `docs/verification-release-${project}.json`;
const report = JSON.parse(readFileSync(reportFile));
const root = path.resolve("../.codex-backups/integral-release");
const directory = path.resolve(report.backupDirectory);
if (report.project !== project || !directory.startsWith(root + path.sep) || report.databases.length < 9 || report.checks.filter(check => check.name.includes("restoration and repeated migrations")).length !== report.databases.length) throw new Error("Incomplete or unrelated database rehearsal");
const docker = (args, input) => execFileSync("docker", args, { input, timeout: 15000, maxBuffer: 256 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
const hash = value => createHash("sha256").update(value).digest("hex");
const broker = report.volumes.find(item => item.service === "rabbitmq");
if (!/^sha256:[a-f0-9]{64}$/.test(broker?.imageId ?? "") || !/^[a-zA-Z0-9.-]+$/.test(broker.hostname)) throw new Error("Invalid broker snapshot metadata");
const archive = readFileSync(path.join(directory, "rabbitmq.tar.gz"));
if (hash(archive) !== broker.sha256) throw new Error("Broker archive checksum mismatch");
for (const db of report.databases) if (hash(readFileSync(path.join(directory, `${db.domain}.dump`))) !== db.sha256) throw new Error("Database backup checksum mismatch");
const name = "integral-broker-" + randomUUID().slice(0, 8);
let restored = false;
try {
  const owner = docker(["run", "--rm", "--network", "none", "--entrypoint", "sh", broker.imageId, "-c", "printf '%s:%s' \"$(id -u rabbitmq)\" \"$(id -g rabbitmq)\""]).toString().trim().split(":");
  if (!owner.every(value => /^\d+$/.test(value))) throw new Error("Invalid owner");
  docker(["run", "-d", "--name", name, "--hostname", broker.hostname, "--add-host", `${broker.hostname}:127.0.0.1`, "--label", "codex.integral-rehearsal=true", "--network", "none", "--tmpfs", `/var/lib/rabbitmq:uid=${owner[0]},gid=${owner[1]}`, "--entrypoint", "sh", broker.imageId, "-c", "sleep infinity"]);
  docker(["exec", "-i", name, "tar", "-xzf", "-", "-C", "/var/lib/rabbitmq"], archive);
  docker(["exec", "-d", "--user", "rabbitmq", "-e", "HOME=/var/lib/rabbitmq", name, "rabbitmq-server"]);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) { try { docker(["exec", "-e", "HOME=/var/lib/rabbitmq", name, "rabbitmq-diagnostics", "-q", "--timeout", "3", "check_running"]); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 500)); } }
  if (!ready) throw new Error("Broker did not become ready");
  const queues = JSON.parse(docker(["exec", "-e", "HOME=/var/lib/rabbitmq", name, "rabbitmqctl", "list_queues", "--formatter", "json", "name", "messages"]).toString());
  for (const queue of report.brokerCheckpoint) if (!queues.some(item => item.name === queue.name && item.messages === queue.messages)) throw new Error(`Pending queue count changed: ${queue.name}: ${queue.messages} -> ${queues.find(item => item.name === queue.name)?.messages}`);
  report.checks.push({ name: "durable broker restoration preserves queues and pending message counts", passed: true, pendingMessages: queues.reduce((sum, queue) => sum + queue.messages, 0) });
  restored = true;
} catch (error) { process.exitCode = 1; console.error("Focused broker restoration failed; live environment unchanged."); console.error(error instanceof Error && !("status" in error) ? error.message : "Docker command failed"); writeFileSync(path.join(directory, "broker-failure.private.txt"), String(error instanceof Error && "stderr" in error ? error.stderr : error), { mode: 0o600 }); }
finally {
  const state = JSON.parse(docker(["inspect", name]).toString())[0];
  if (state.Config.Labels["codex.integral-rehearsal"] !== "true" || state.HostConfig.NetworkMode !== "none") throw new Error("Temporary cleanup guard failed");
  docker(["rm", "-f", name]);
  if (restored) {
    report.passed = true; report.stage = "complete"; report.completedAt = new Date().toISOString();
    delete report.failure;
    writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
    writeFileSync(path.join(directory, "rehearsal-result.private.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
    console.log(`PASS ${project}: all database backups + durable broker restored; ${report.checks.length} checks.`);
  }
}
