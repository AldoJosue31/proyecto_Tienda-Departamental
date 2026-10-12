// Disposable PostgreSQL audit. Never reads .env or changes the running stack.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "package.json"));
const { Pool } = require("pg");
const domains = ["auth", "catalog", "inventory", "pricing", "orders", "analytics", "logistics", "crm", "notification"];
const container = "departamental-supabase-audit-" + randomUUID().slice(0, 8);
const secret = randomBytes(24).toString("hex");
const output = resolve(root, "docs/auditoria-supabase-verificacion-2026-10-11.json");
const result = { startedAt: new Date().toISOString(), scope: "Disposable PostgreSQL 17; no hosted database writes or production data", container, migrations: [], runtime: [], cleanup: false };
let created = false;
let admin;

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    let stdout = "", stderr = "";
    child.stdout?.on("data", data => { stdout += data; });
    child.stderr?.on("data", data => { stderr += data; });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) reject(new Error(`${command} exited ${code}: ${(stderr || stdout).replaceAll(secret, "[audit password]").slice(-1500)}`));
      else resolveRun(stdout);
    });
  });
}
const pause = ms => new Promise(done => setTimeout(done, ms));
const ident = value => '"' + value.replaceAll('"', '""') + '"';

try {
  // Random host port and localhost-only binding avoid collisions and exposure.
  await run("docker", ["run", "--detach", "--rm", "--name", container, "--label", "codex.audit=supabase-compatibility", "--publish", "127.0.0.1::5432", "--env", "POSTGRES_PASSWORD=" + secret, "postgres:17-alpine"]);
  created = true;
  const info = JSON.parse(await run("docker", ["inspect", container]))[0];
  const port = Number(info.NetworkSettings.Ports["5432/tcp"][0].HostPort);
  assert.ok(port > 0);
  const connect = database => ({ host: "127.0.0.1", port, user: "postgres", password: secret, database, connectionTimeoutMillis: 2000 });
  for (let attempt = 0; attempt < 40; attempt++) {
    const probe = new Pool(connect("postgres"));
    try { await probe.query("SELECT 1"); await probe.end(); break; }
    catch (error) { await probe.end(); if (attempt === 39) throw error; await pause(500); }
  }
  admin = new Pool(connect("postgres"));
  result.serverVersion = (await admin.query("SHOW server_version")).rows[0].server_version;
  result.image = info.Image;
  console.log("Disposable PostgreSQL " + result.serverVersion + " ready.");
  const runtimeUrls = {};
  for (const schema of ["public", "app_private"]) {
    const profile = schema === "public" ? "public" : "private";
    for (const domain of domains) {
      const role = `audit_${profile}_${domain}`;
      const database = role;
      await admin.query(`CREATE ROLE ${ident(role)} LOGIN PASSWORD '${secret}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
      await admin.query(`CREATE DATABASE ${ident(database)} OWNER ${ident(role)}`);
      const setup = new Pool(connect(database));
      // The connected Supabase project has pgcrypto in extensions, not public.
      await setup.query("CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; REVOKE CREATE ON SCHEMA public FROM PUBLIC");
      if (schema !== "public") await setup.query(`CREATE SCHEMA ${ident(schema)} AUTHORIZATION ${ident(role)}`);
      else await setup.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${ident(role)}`);
      await setup.query(`GRANT USAGE ON SCHEMA extensions TO ${ident(role)}; ALTER ROLE ${ident(role)} IN DATABASE ${ident(database)} SET search_path TO ${ident(schema)}, extensions, pg_catalog`);
      await setup.end();
      const url = `postgresql://${role}:${secret}@127.0.0.1:${port}/${database}`;
      const cwd = resolve(root, `services/${domain}-service`);
      const migrationFiles = (await readdir(resolve(cwd, "migrations"))).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
      const env = { ...process.env, DATABASE_URL: url, DATABASE_SSL: "false", ENV_FILE: resolve(root, "docs/.audit-no-env-file") };
      const migrationArgs = [resolve(root, "node_modules/tsx/dist/cli.mjs"), "--tsconfig", resolve(cwd, "tsconfig.json"), resolve(cwd, "src/database/migrate.ts")];
      await run(process.execPath, migrationArgs, { cwd, env });
      const pool = new Pool({ connectionString: url });
      const ledger = ident(domain + "_schema_migrations");
      const first = (await pool.query(`SELECT name FROM ${ledger} ORDER BY name`)).rows.map(row => row.name);
      assert.deepEqual(first, migrationFiles);
      // Actual migration runner must be safe on subsequent startup.
      await run(process.execPath, migrationArgs, { cwd, env });
      assert.deepEqual((await pool.query(`SELECT name FROM ${ledger} ORDER BY name`)).rows.map(row => row.name), first);
      const objects = (await pool.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname=$1", [schema])).rows[0].count;
      const privilege = (await pool.query("SELECT rolsuper FROM pg_roles WHERE rolname=current_user")).rows[0];
      assert.equal(privilege.rolsuper, false);
      await pool.end();
      result.migrations.push({ domain, profile, schema, files: first, tableCount: objects, nonSuperuser: true, secondRunUnchanged: true, passed: true });
      if (profile === "private") runtimeUrls[domain] = url;
      console.log(`${domain}: ${first.length} migrations passed in ${schema}, including repeat startup.`);
    }
  }
  // Source classes run unchanged against the isolated private schemas.
  const runtimeOutput = await run(process.execPath, [resolve(root, "node_modules/tsx/dist/cli.mjs"), "--tsconfig", resolve(root, "services/audit-tools/tsconfig.json"), resolve(root, "services/audit-tools/supabase-runtime.ts")], {
    cwd: root,
    env: { ...process.env, AUDIT_DATABASE_URLS: JSON.stringify(runtimeUrls), AUDIT_DISPOSABLE_CONTAINER: container },
  });
  const marker = runtimeOutput.split(/\r?\n/).find(line => line.startsWith("AUDIT_RUNTIME="));
  assert.ok(marker, "Runtime report was not returned");
  result.runtime = JSON.parse(marker.slice("AUDIT_RUNTIME=".length));
  result.passed = result.runtime.every(check => check.passed);
  console.log("Runtime checks: " + result.runtime.length + " passed.");
} catch (error) {
  result.passed = false;
  result.failure = String(error.message).replaceAll(secret, "[audit password]");
  process.exitCode = 1;
  console.error(result.failure);
} finally {
  await admin?.end();
  if (created) {
    // Only remove the exact container created by this invocation.
    await run("docker", ["rm", "--force", container]);
    result.cleanup = true;
  }
  result.finishedAt = new Date().toISOString();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n");
  console.log("Audit evidence saved: " + output);
}
