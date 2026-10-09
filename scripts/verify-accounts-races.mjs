import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHmac, createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

const project = "departamental-five-phases";
const env = Object.fromEntries(readFileSync(".env.integration", "utf8").split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
assert.equal(env.COMPOSE_PROJECT_NAME, project);
const label = execFileSync("docker", ["inspect", "--format", '{{ index .Config.Labels "com.docker.compose.project" }}', project + "-auth-postgres-1"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
assert.equal(label, project);
const database = new pg.Pool({ host: "127.0.0.1", port: 55431, user: "auth_service", database: "auth_service", password: env.AUTH_DB_PASSWORD });
const run = randomUUID(), password = "Concurrency phrase " + run, checks = [];
const hash = value => createHash("sha256").update(value).digest("hex");
async function call(path, body, token, method = "POST") {
  const timestamp = String(Date.now()), ip = "198.19." + randomBytes(1)[0] + "." + randomBytes(1)[0];
  const signature = createHmac("sha256", env.TRUSTED_BFF_IP_KEY).update(timestamp + ":" + ip).digest("hex");
  const response = await fetch("http://127.0.0.1:3301" + path, { method, headers: { "Content-Type": "application/json", "x-auth-client-ip": ip, "x-auth-client-timestamp": timestamp, "x-auth-client-signature": signature, ...(token ? { Authorization: "Bearer " + token, "Idempotency-Key": randomUUID() } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  return { status: response.status, body: await response.json().catch(() => null) };
}
async function user(email) { return (await database.query("SELECT * FROM auth_users WHERE email=$1", [email])).rows[0]; }
async function linkToken(identity) {
  const challenge = (await database.query("SELECT token_hash FROM auth_onboarding_challenges WHERE user_id=$1 ORDER BY generation DESC LIMIT 1", [identity])).rows[0];
  for (let attempt = 0; attempt < 90; attempt++) {
    const list = await (await fetch("http://localhost:18025/api/v1/messages?limit=1000")).json();
    for (const message of list.messages) {
      const detail = await (await fetch("http://localhost:18025/api/v1/message/" + message.ID)).json();
      const raw = detail.Text?.split(/\r?\n/).find(line => /^http:\/\/localhost:3105\//.test(line.trim()))?.trim();
      if (!raw) continue;
      const token = new URLSearchParams(new URL(raw).hash.slice(1)).get("token");
      if (token && hash(token) === challenge.token_hash) return token;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("SMTP_CHALLENGE_MISSING");
}
async function check(name, operation) {
  const start = Date.now();
  try { const detail = await operation(); checks.push({ name, passed: true, milliseconds: Date.now() - start, ...detail }); console.log("PASS " + name); }
  catch { checks.push({ name, passed: false, milliseconds: Date.now() - start }); console.log("FAIL " + name); throw new Error("CONCURRENCY_CHECK_FAILED"); }
}
try {
  const admin = await call("/auth/login", { email: "admin@departamental.local", password: env.SEED_ADMIN_PASSWORD });
  assert.equal(admin.status, 200);
  await check("resend racing with acceptance leaves one activation and never revives the retired challenge", async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const email = `race-${run}-resend-${attempt}@example.test`;
      const invited = await call("/auth/employees/invitations", { email, name: "Concurrency employee" }, admin.body.accessToken);
      assert.equal(invited.status, 202);
      const employee = await user(email), token = await linkToken(employee.id);
      await database.query("UPDATE auth_onboarding_email_limits SET last_sent_at=NOW()-INTERVAL '61 seconds' WHERE email_hash=$1", [hash(email)]);
      const results = await Promise.all([call("/auth/employee-invitations/accept", { token, password }), call(`/auth/employees/${employee.id}/invitation/resend`, {}, admin.body.accessToken)]);
      const current = await user(email);
      if (current.onboarding_status === "PENDING_INVITATION") {
        assert.equal(results[0].status, 400); assert.equal(results[1].status, 202);
        assert.equal((await call("/auth/employee-invitations/accept", { token: await linkToken(employee.id), password })).status, 200);
      } else { assert.equal(current.onboarding_status, "READY"); assert.equal(results[0].status, 200); assert.ok([202, 409].includes(results[1].status)); }
      assert.equal((await call("/auth/employee-invitations/accept", { token, password })).status, 400);
      assert.equal((await database.query("SELECT COUNT(*)::int AS count FROM auth_onboarding_audit WHERE user_id=$1 AND action='EMPLOYEE_INVITATION_ACCEPTED'", [employee.id])).rows[0].count, 1);
      assert.equal((await database.query("SELECT COUNT(*)::int AS count FROM auth_onboarding_challenges WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL", [employee.id])).rows[0].count, 0);
    }
    return { races: 3, duplicateActivations: 0 };
  });
  await check("disabling racing with refresh revokes every token even if rotation finishes first", async () => {
    const email = `race-${run}-refresh@example.test`;
    assert.equal((await call("/auth/employees/invitations", { email, name: "Refresh race employee" }, admin.body.accessToken)).status, 202);
    const employee = await user(email);
    assert.equal((await call("/auth/employee-invitations/accept", { token: await linkToken(employee.id), password })).status, 200);
    for (let attempt = 0; attempt < 5; attempt++) {
      const identity = await user(email), session = await call("/auth/login", { email, password }); assert.equal(session.status, 200);
      const results = await Promise.all([call(`/auth/employees/${employee.id}/status`, { isActive: false, authVersion: identity.auth_version }, admin.body.accessToken, "PATCH"), call("/auth/refresh", { refreshToken: session.body.refreshToken })]);
      assert.equal(results[0].status, 200); assert.ok([200, 401].includes(results[1].status));
      const rotated = results[1].status === 200 ? results[1].body : session.body;
      assert.equal((await call("/auth/refresh", { refreshToken: rotated.refreshToken })).status, 401);
      assert.equal((await call("/auth/me", undefined, rotated.accessToken, "GET")).status, 401);
      assert.equal((await database.query("SELECT COUNT(*)::int AS count FROM auth_refresh_tokens WHERE user_id=$1 AND revoked_at IS NULL", [employee.id])).rows[0].count, 0);
      const disabled = await user(email);
      assert.equal((await call(`/auth/employees/${employee.id}/status`, { isActive: true, authVersion: disabled.auth_version }, admin.body.accessToken, "PATCH")).status, 200);
      assert.equal((await call("/auth/me", undefined, rotated.accessToken, "GET")).status, 401);
    }
    return { races: 5, survivingRevokedSessions: 0 };
  });
} catch { process.exitCode = 1; }
finally {
  await database.end();
  writeFileSync("docs/verification-accounts-races.json", JSON.stringify({ completedAt: new Date().toISOString(), project, passed: checks.length === 2 && checks.every(check => check.passed), checks, privacy: { credentialsTokensLinksExcluded: true } }, null, 2) + "\n");
}
