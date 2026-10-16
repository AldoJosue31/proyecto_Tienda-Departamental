import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// Business backup and migration rehearsal. No live migration or volume removal.
const projectArgument = process.argv.indexOf("--project");
const project = projectArgument >= 0 ? process.argv[projectArgument + 1] : "web";
if (!["web", "departamental-five-phases"].includes(project)) throw new Error("Unsupported Compose project");
const startStopped = process.argv.includes("--start-stopped"), started = [], stamp = new Date().toISOString().replace(/[:.]/g, "-");
const directory = path.resolve("../.codex-backups/accounts-release", stamp);
mkdirSync(directory, { recursive: true });
const checks = [], manifest = { completedAt: null, project, backups: [], checks };
let rehearsal, releaseReport;
const docker = (args, input) => execFileSync("docker", args, { ...(input ? { input } : {}), timeout: 60000, maxBuffer: 128 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
const inspect = name => JSON.parse(docker(["inspect", name]).toString())[0];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sql = (database, statement) => docker(["exec", "-i", rehearsal, "psql", "-U", "postgres", "-d", database, "-At", "-v", "ON_ERROR_STOP=1"], statement).toString().trim();
const fingerprint = (database, statement) => createHash("sha256").update(sql(database, statement)).digest("hex");
const userQuery = "SELECT coalesce(json_agg(u ORDER BY id),'[]'::json) FROM (SELECT id,email,name,password_hash,role,is_active FROM auth_users) u;";
const refreshQuery = "SELECT coalesce(json_agg(t ORDER BY id),'[]'::json) FROM auth_refresh_tokens t;";
try {
  for (const domain of ["auth", "notification"]) {
    const container = `${project}-${domain}-postgres-1`, state = inspect(container);
    if (state.Config.Labels["com.docker.compose.project"] !== project || state.Config.Labels["com.docker.compose.service"] !== `${domain}-postgres`) throw new Error("Backup isolation mismatch");
    if (!state.State.Running) {
      if (!startStopped) throw new Error("Database must run before backup; --start-stopped permits starting only these two databases");
      docker(["start", container]); started.push(container);
    }
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { docker(["exec", container, "pg_isready", "-U", `${domain}_service`, "-d", `${domain}_service`]); ready = true; break; }
      catch { await sleep(500); }
    }
    if (!ready) throw new Error("Database did not become ready");
    const dump = docker(["exec", container, "pg_dump", "--no-password", "-U", `${domain}_service`, "-d", `${domain}_service`, "--format=custom"]);
    if (dump.length < 100) throw new Error("Empty backup");
    writeFileSync(path.join(directory, `${domain}.dump`), dump, { mode: 0o600 });
    manifest.backups.push({ database: domain, bytes: dump.length, sha256: createHash("sha256").update(dump).digest("hex") });
  }
  rehearsal = "accounts-migration-rehearsal-" + randomUUID().slice(0, 8);
  docker(["run", "--detach", "--name", rehearsal, "--label", "codex.account-migration-rehearsal=true", "--network", "none", "--tmpfs", "/var/lib/postgresql/data", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16-alpine"]);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) { try { docker(["exec", rehearsal, "pg_isready", "-U", "postgres"]); ready = true; break; } catch { await sleep(500); } }
  if (!ready) throw new Error("Rehearsal database did not become ready");
  for (const domain of ["auth", "notification"]) {
    docker(["exec", rehearsal, "createdb", "-U", "postgres", `${domain}_service`]);
    docker(["exec", "-i", rehearsal, "pg_restore", "--exit-on-error", "--no-owner", "--no-privileges", "-U", "postgres", "-d", `${domain}_service`], readFileSync(path.join(directory, `${domain}.dump`)));
  }
  const usersBefore = fingerprint("auth_service", userQuery), sessionsBefore = fingerprint("auth_service", refreshQuery);
  const usersCount = Number(sql("auth_service", "SELECT COUNT(*) FROM auth_users;"));
  const sessionsCount = Number(sql("auth_service", "SELECT COUNT(*) FROM auth_refresh_tokens;"));
  const authNeeded = sql("auth_service", "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='auth_users' AND column_name='onboarding_status';") === "0";
  if (authNeeded) sql("auth_service", "BEGIN;\n" + readFileSync("services/auth-service/migrations/002_account_onboarding.sql", "utf8") + "\nCOMMIT;");
  const notificationNeeded = sql("notification_service", "SELECT to_regclass('notification_onboarding_deliveries') IS NULL;") === "t";
  if (notificationNeeded) sql("notification_service", "BEGIN;\n" + readFileSync("services/notification-service/migrations/003_auth_onboarding.sql", "utf8") + "\nCOMMIT;");
  const compatible = usersBefore === fingerprint("auth_service", userQuery) && sessionsBefore === fingerprint("auth_service", refreshQuery);
  if (!compatible) throw new Error("Restored identities or sessions changed during migration");
  checks.push({ name: "Auth and Notification backups restore successfully and account migrations preserve existing identities and refresh records", passed: true, usersCount, sessionsCount, authMigrationAppliedToCopy: authNeeded, notificationMigrationAppliedToCopy: notificationNeeded });
  releaseReport = { completedAt: new Date().toISOString(), project, checks, liveDatabasesMigrated: false, privacy: { backupsOutsideGit: true, credentialsAndUserRowsExcluded: true } };
  console.log(`Backed up ${project} Auth and Notification; restored both into an isolated copy. Preserved ${usersCount} users and ${sessionsCount} refresh records.`);
} catch {
  process.exitCode = 1; console.error("Account backup or migration rehearsal failed. Private files were preserved; live migrations were not applied.");
} finally {
  if (rehearsal) {
    try {
      const state = inspect(rehearsal);
      const temporaryStorage = Object.hasOwn(state.HostConfig.Tmpfs || {}, "/var/lib/postgresql/data") || state.Mounts.some(mount => mount.Type === "tmpfs" && mount.Destination === "/var/lib/postgresql/data");
      if (state.Config.Labels["codex.account-migration-rehearsal"] !== "true" || !temporaryStorage || state.HostConfig.NetworkMode !== "none" || !/^accounts-migration-rehearsal-[a-f0-9]{8}$/.test(rehearsal)) throw new Error("Rehearsal cleanup guard failed");
      docker(["rm", "--force", rehearsal]);
    } catch { process.exitCode = 1; }
  }
  for (const container of started) { try { docker(["stop", container]); } catch { process.exitCode = 1; } }
  manifest.completedAt = new Date().toISOString();
  writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  if (releaseReport) writeFileSync("docs/verification-accounts-release.json", JSON.stringify({ ...releaseReport, passed: process.exitCode !== 1, temporaryContainerRemoved: process.exitCode !== 1 }, null, 2) + "\n");
}
