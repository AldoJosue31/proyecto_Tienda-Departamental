import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { io } from "socket.io-client";

// Run only against the disposable integration project; never original business databases.
const project = "departamental-five-phases";
const root = fileURLToPath(new URL("../", import.meta.url));
const reportPath = new URL("../docs/verification-accounts-first-five.json", import.meta.url);
const env = Object.fromEntries(readFileSync(new URL("../.env.integration", import.meta.url), "utf8")
  .replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => {
    const at = line.indexOf("=");
    return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^(['"])(.*)\1$/, "$2")];
  }));
assert.equal(env.COMPOSE_PROJECT_NAME, project);
for (const key of ["AUTH_DB_PASSWORD", "NOTIFICATION_DB_PASSWORD", "JWT_ACCESS_SECRET",
  "TRUSTED_BFF_IP_KEY", "AUTH_STATUS_INTERNAL_SERVICE_KEY", "AUTH_ONBOARDING_INTERNAL_SERVICE_KEY", "ONBOARDING_EMAIL_KEY"]) assert.ok(env[key]);
const web = "http://localhost:3105", gateway = "http://localhost:8005", authUrl = "http://127.0.0.1:3301";
const startedAt = new Date().toISOString(), runId = randomUUID(), checks = [], sensitive = new Set(), stopped = new Set();
const authRequire = createRequire(new URL("../services/auth-service/package.json", import.meta.url));
const notificationRequire = createRequire(new URL("../services/notification-service/package.json", import.meta.url));
const { sign } = authRequire("jsonwebtoken");
const pools = {};
let step = 0, admin, seedEmployee, seedCustomer, initialUsers, initialRefresh, baselineUsersHash;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = value => createHash("sha256").update(value).digest("hex");
const email = name => "accounts-" + runId.slice(0, 12) + "-" + name + "@example.test";
const password = name => {
  const value = "Account phrase " + name + " " + runId.slice(0, 12);
  sensitive.add(value);
  return value;
};
const nonce = () => {
  const value = randomBytes(32).toString("base64url");
  sensitive.add(value);
  return value;
};

function inspect(service) {
  return JSON.parse(execFileSync("docker", ["inspect", project + "-" + service + "-1"], { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] }))[0];
}
function assertContainer(service, port, internalPort) {
  const container = inspect(service);
  assert.equal(container.Config.Labels["com.docker.compose.project"], project);
  assert.equal(container.Config.Labels["com.docker.compose.service"], service);
  assert.equal(container.State.Running, true);
  if (port) {
    const published = container.NetworkSettings.Ports[internalPort + "/tcp"];
    assert.ok(published?.some(binding => binding.HostIp === "127.0.0.1" && binding.HostPort === String(port)));
    assert.ok(published.every(binding => binding.HostIp === "127.0.0.1"));
  }
}
function compose(...args) {
  return execFileSync("docker", ["compose", "-p", project, "--env-file", ".env.integration", "-f", "compose.yaml", "-f", "compose.integration.yaml", ...args],
    { cwd: root, encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
}
async function stop(service) { stopped.add(service); compose("stop", service); }
async function start(service) {
  compose("start", service);
  await until(() => {
    const container = inspect(service);
    return container.State.Running && (!container.State.Health || container.State.Health.Status === "healthy");
  }, 90_000);
  stopped.delete(service);
}
async function until(operation, milliseconds = 30_000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    const result = await operation();
    if (result) return result;
    await sleep(250);
  }
  throw new Error("INTEGRATION_DEADLINE");
}
function save(completed) {
  writeFileSync(reportPath, JSON.stringify({ startedAt, completedAt: completed ? new Date().toISOString() : null, project, runId,
    passed: completed && checks.every(check => check.passed), checks,
    privacy: { tokensLinksPasswordsExcluded: true }, scope: "Account onboarding phases 1-5; interface phase 6 is pending." }, null, 2) + "\n");
}
async function check(name, operation) {
  const startTime = Date.now();
  console.log("CHECK " + name);
  try {
    const details = await operation();
    checks.push({ name, passed: true, milliseconds: Date.now() - startTime, ...(details || {}) });
    console.log("PASS " + name);
  } catch (error) {
    checks.push({ name, passed: false, milliseconds: Date.now() - startTime,
      failure: error?.code === "ERR_ASSERTION" ? "ASSERTION_FAILED" : "INTEGRATION_FAILED" });
    save(false);
    throw new Error("ACCOUNT_CHECK_FAILED");
  }
}
function clientHeaders(ip) {
  const timestamp = String(Date.now());
  return { "x-auth-client-ip": ip, "x-auth-client-timestamp": timestamp,
    "x-auth-client-signature": createHmac("sha256", env.TRUSTED_BFF_IP_KEY).update(timestamp + ":" + ip).digest("hex") };
}
function uniqueIp() { return "2001:db8:" + runId.slice(0, 4) + ":" + (++step).toString(16) + "::1"; }
async function request(base, path, { method = "GET", body, token, headers = {} } = {}) {
  const response = await fetch(base + path, { method, headers: {
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: "Bearer " + token } : {}), ...headers },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: "manual", signal: AbortSignal.timeout(10_000) });
  return { status: response.status, body: await response.json().catch(() => null), response };
}
const api = (path, options) => request(gateway, path, options);
const direct = (path, options = {}) => request(authUrl, path, { ...options, headers: { ...clientHeaders(uniqueIp()), ...options.headers } });
async function login(address, secret, useGateway = false) {
  sensitive.add(secret);
  const result = await (useGateway ? api : direct)("/auth/login", { method: "POST", body: { email: address, password: secret } });
  assert.equal(result.status, 200);
  assert.ok(result.body?.accessToken && result.body?.refreshToken);
  sensitive.add(result.body.accessToken); sensitive.add(result.body.refreshToken);
  return result.body;
}
class Browser {
  constructor(accessToken) { this.jar = new Map(accessToken ? [["departamental_access", accessToken]] : []); this.csrf = null; }
  get cookie() { return [...this.jar].map(([name, value]) => name + "=" + value).join("; "); }
  async context() {
    const result = await this.call("/api/auth/onboarding/context", { csrf: false });
    assert.equal(result.status, 200);
    this.csrf = result.body.csrfToken;
    sensitive.add(this.csrf);
    assert.match(this.csrf, /^[A-Za-z0-9_-]{43,128}$/);
    const cookies = result.response.headers.getSetCookie();
    assert.ok(this.jar.has("departamental_onboarding_csrf"));
    if (cookies.length) assert.ok(cookies.every(value => /HttpOnly/i.test(value) && /SameSite=Strict/i.test(value)));
  }
  async call(path, { method = "GET", body, headers = {}, csrf = true, origin = web } = {}) {
    const result = await request(web, path, { method, body, headers: {
      ...(this.cookie ? { Cookie: this.cookie } : {}), ...(method !== "GET" ? { Origin: origin } : {}),
      ...(csrf && this.csrf ? { "X-CSRF-Token": this.csrf } : {}), ...headers,
    } });
    for (const cookie of result.response.headers.getSetCookie()) {
      const first = cookie.split(";")[0], at = first.indexOf("=");
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(cookie)) this.jar.delete(first.slice(0, at));
      else {
        const value = first.slice(at + 1);
        if (value.length >= 20) sensitive.add(value);
        this.jar.set(first.slice(0, at), value);
      }
    }
    return result;
  }
}
async function identity(address) {
  return (await pools.auth.query("SELECT id,email,name,password_hash,role,is_active,onboarding_status,auth_version,email_verified_at,verification_source FROM auth_users WHERE lower(email)=lower($1)", [address])).rows[0];
}
async function latestChallenge(userId) {
  return (await pools.auth.query("SELECT * FROM auth_onboarding_challenges WHERE user_id=$1 ORDER BY generation DESC LIMIT 1", [userId])).rows[0];
}
async function messages(address) {
  const result = await request("http://localhost:18025", "/api/v1/messages?limit=1000");
  assert.equal(result.status, 200);
  return result.body.messages.filter(message => message.To?.some(recipient => recipient.Address.toLowerCase() === address.toLowerCase()));
}
async function linkFor(address, challenge) {
  return until(async () => {
    for (const message of await messages(address)) {
      const result = await request("http://localhost:18025", "/api/v1/message/" + message.ID);
      const raw = result.body?.Text?.split(/\r?\n/).find(line => /^https?:\/\//.test(line.trim()))?.trim();
      if (!raw) continue;
      const link = new URL(raw);
      const token = new URLSearchParams(link.hash.slice(1)).get("token");
      if (!token || sha(token) !== challenge.token_hash) continue;
      assert.equal(link.origin, web);
      assert.equal(link.pathname, challenge.purpose === "EMAIL_VERIFICATION" ? "/verify-email" : "/accept-invitation");
      assert.equal(link.searchParams.has("token"), false);
      sensitive.add(token); sensitive.add(raw);
      return { token, link };
    }
    return null;
  }, 45_000);
}
async function settledDelivery(challenge, status = "SENT") {
  await until(async () => (await latestChallenge(challenge.user_id))?.delivery_status === status, 45_000);
  const row = (await pools.notification.query("SELECT status,attempts,encrypted_content FROM notification_onboarding_deliveries WHERE challenge_id=$1 AND generation=$2", [challenge.id, challenge.generation])).rows[0];
  assert.equal(row?.status, status);
  assert.equal(row.encrypted_content, null);
  return row;
}
async function registerDirect(name, returnPath = "/checkout") {
  const address = email(name), secret = password(name), browserNonce = nonce();
  const result = await direct("/auth/register", { method: "POST", body: { email: address, name: "Integration " + name, password: secret, browserNonce, returnPath } });
  assert.equal(result.status, 202);
  const user = await identity(address), challenge = await latestChallenge(user.id);
  return { address, secret, browserNonce, user, challenge };
}
async function invite(browser, name) {
  const address = email(name);
  const result = await browser.call("/api/auth/employees/invitations", { method: "POST", body: { name: "Integration " + name, email: address }, headers: { "Idempotency-Key": randomUUID() } });
  assert.equal(result.status, 202);
  return { address, user: result.body.employee, challenge: await latestChallenge(result.body.employee.id) };
}
const database = pool => ({ query: (sql, values) => pool.query(sql, values), withTransaction: async operation => {
  const client = await pool.connect(); try { await client.query("BEGIN"); const result = await operation(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
} });
function socketFor(token) {
  return io(gateway, { path: "/realtime/socket.io", transports: ["websocket"], reconnection: false,
    timeout: 10_000, autoConnect: false, extraHeaders: { Origin: web, Cookie: "departamental_access=" + token } });
}
async function connectSocket(socket) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.disconnect(); reject(new Error("SOCKET_DEADLINE")); }, 12_000);
    socket.once("connect", () => { clearTimeout(timer); resolve(); });
    socket.once("connect_error", () => { clearTimeout(timer); reject(new Error("SOCKET_REJECTED")); });
    socket.connect();
  });
}

try {
  await check("integration isolation and loopback database bindings", async () => {
    for (const [service, port, internalPort] of [
      ["auth-postgres", 55431, 5432], ["notification-postgres", 55440, 5432],
      ["servicio-autenticacion", 3301, 3001], ["aplicacion-web", 3105, 3000],
      ["pasarela-api", 8005, 8000], ["smtp-capture", 18025, 8025], ["rabbitmq", 55672, 5672],
    ]) assertContainer(service, port, internalPort);
    for (const [domain, port] of [["auth", 55431], ["notification", 55440]]) {
      pools[domain] = new pg.Pool({ host: "127.0.0.1", port, database: domain + "_service", user: domain + "_service", password: env[domain.toUpperCase() + "_DB_PASSWORD"] });
    }
    initialUsers = (await pools.auth.query("SELECT id,email,name,password_hash,role FROM auth_users ORDER BY id")).rows;
    initialRefresh = (await pools.auth.query("SELECT id,user_id,token_hash,family_id,expires_at,revoked_at,replaced_by_token_id,created_at FROM auth_refresh_tokens ORDER BY id")).rows;
    baselineUsersHash = sha(JSON.stringify(initialUsers));
    const argument = process.argv.indexOf("--baseline");
    if (argument >= 0) {
      const before = JSON.parse(readFileSync(process.argv[argument + 1], "utf8").replace(/^\uFEFF/, ""));
      assert.equal(initialUsers.length, before.usersCount);
      assert.equal(baselineUsersHash, before.usersSha256);
      assert.equal(initialRefresh.length, before.refreshCount);
      assert.equal(sha(JSON.stringify(initialRefresh)), before.refreshSha256);
    }
    return { existingAccounts: initialUsers.length, existingRefreshRecords: initialRefresh.length, migrationSnapshotCompared: argument >= 0 };
  });

  await check("existing accounts, refresh rotation and legacy JWT version zero remain valid", async () => {
    admin = await login("admin@departamental.local", env.SEED_ADMIN_PASSWORD, true);
    seedEmployee = await login("employee@departamental.local", env.SEED_EMPLOYEE_PASSWORD, true);
    seedCustomer = await login("customer@departamental.local", env.SEED_CUSTOMER_PASSWORD, true);
    for (const session of [admin, seedEmployee, seedCustomer]) {
      assert.ok(initialUsers.some(user => user.id === session.user.id && user.role === session.user.role));
      const user = await identity(session.user.email);
      assert.equal(user.onboarding_status, "READY"); assert.ok(user.email_verified_at);
      const legacy = sign({ role: session.user.role, jti: randomUUID() }, env.JWT_ACCESS_SECRET,
        { algorithm: "HS256", issuer: "departamental-auth-service", subject: session.user.id, expiresIn: 900 });
      sensitive.add(legacy);
      assert.equal((await api("/auth/me", { token: legacy })).status, 200);
    }
    const refresh = await direct("/auth/refresh", { method: "POST", body: { refreshToken: seedCustomer.refreshToken } });
    assert.equal(refresh.status, 200);
    sensitive.add(refresh.body.accessToken); sensitive.add(refresh.body.refreshToken);
  });

  const adminBrowser = new Browser(admin.accessToken); await adminBrowser.context();
  await check("BFF requires origin and CSRF and rejects caller-assigned role", async () => {
    const body = { name: "Blocked", email: email("blocked"), password: password("blocked") };
    const missing = await adminBrowser.call("/api/auth/register", { method: "POST", body, csrf: false });
    assert.equal(missing.status, 403); assert.equal(missing.body.code, "INVALID_CSRF_TOKEN"); assert.ok(missing.body.correlationId);
    const cross = await adminBrowser.call("/api/auth/register", { method: "POST", body, origin: "https://foreign.example.test" });
    assert.equal(cross.status, 403); assert.equal(cross.body.code, "INVALID_ORIGIN");
    for (const role of ["ADMIN", "EMPLOYEE"]) assert.equal((await adminBrowser.call("/api/auth/register", { method: "POST", body: { ...body, role } })).status, 400);
    assert.equal(await identity(body.email), undefined);
    assert.equal((await direct("/auth/register", { method: "POST", body: { ...body, browserNonce: nonce(), role: "ADMIN" } })).status, 400);
  });

  let customer, customerBrowser;
  await check("BFF customer registration stays pending until same-browser explicit confirmation", async () => {
    customerBrowser = new Browser(); await customerBrowser.context();
    const address = email("bff-customer"), secret = password("bff-customer");
    const created = await customerBrowser.call("/api/auth/register", { method: "POST", body: { name: "BFF customer", email: address, password: secret, returnPath: "/checkout" } });
    assert.equal(created.status, 202); assert.ok(customerBrowser.jar.get("departamental_onboarding_nonce"));
    const user = await identity(address), challenge = await latestChallenge(user.id);
    assert.equal(user.role, "CUSTOMER"); assert.equal(user.onboarding_status, "PENDING_EMAIL"); assert.equal(user.email_verified_at, null);
    assert.equal((await direct("/auth/login", { method: "POST", body: { email: address, password: secret } })).status, 401);
    const message = await linkFor(address, challenge); await settledDelivery(challenge);
    assert.equal((await identity(address)).onboarding_status, "PENDING_EMAIL");
    assert.equal(message.link.searchParams.get("next"), "/checkout");
    const confirmed = await customerBrowser.call("/api/auth/email-verification/confirm", { method: "POST", body: { token: message.token } });
    assert.equal(confirmed.status, 200); assert.equal(confirmed.body.returnPath, "/checkout");
    assert.equal(customerBrowser.jar.has("departamental_access"), false);
    customer = await login(address, secret);
    assert.equal(customer.user.id, user.id); assert.equal(customer.user.role, "CUSTOMER");
    assert.equal((await api("/orders/mine", { token: customer.accessToken })).status, 200);
    assert.equal((await direct("/auth/email-verification/confirm", { method: "POST", body: { token: message.token, password: secret } })).status, 400);
  });

  await check("cross-browser confirmation requires a new password and sanitizes administrative return destinations", async () => {
    const original = new Browser(); await original.context();
    const address = email("other-browser"), oldPassword = password("old"), replacement = password("replacement");
    assert.equal((await original.call("/api/auth/register", { method: "POST", body: { name: "Other browser", email: address, password: oldPassword, returnPath: "/users?admin=1" } })).status, 202);
    const user = await identity(address), challenge = await latestChallenge(user.id), mail = await linkFor(address, challenge);
    const other = new Browser(); await other.context();
    const refused = await other.call("/api/auth/email-verification/confirm", { method: "POST", body: { token: mail.token } });
    assert.equal(refused.status, 409); assert.equal(refused.body.code, "PASSWORD_CONFIRMATION_REQUIRED");
    const accepted = await other.call("/api/auth/email-verification/confirm", { method: "POST", body: { token: mail.token, password: replacement } });
    assert.equal(accepted.status, 200); assert.equal(accepted.body.returnPath, "/");
    assert.equal((await direct("/auth/login", { method: "POST", body: { email: address, password: oldPassword } })).status, 401);
    assert.equal((await login(address, replacement)).user.id, user.id);
  });

  await check("untrusted browser and Gateway IP headers cannot create forged rate-limit identities", async () => {
    const browser = new Browser(); await browser.context();
    for (let i = 0; i < 2; i++) {
      const spoofed = uniqueIp();
      const result = await browser.call("/api/auth/email-verification/resend", {
        method: "POST", body: { email: email("unknown-spoof") },
        headers: { ...clientHeaders(spoofed), "X-Forwarded-For": spoofed, "x-onboarding-limit-ip": spoofed },
      });
      assert.equal(result.status, 202);
      assert.equal((await pools.auth.query("SELECT COUNT(*)::int AS count FROM auth_onboarding_rate_limits WHERE scope='IP' AND subject_hash=$1", [sha(spoofed)])).rows[0].count, 0);
    }
    const forged = uniqueIp();
    const result = await api("/auth/email-verification/resend", {
      method: "POST", body: { email: email("unknown-spoof") },
      headers: { "x-auth-client-ip": forged, "x-auth-client-timestamp": String(Date.now()),
        "x-auth-client-signature": "0".repeat(64), "x-onboarding-limit-ip": forged },
    });
    assert.equal(result.status, 202);
    assert.equal((await pools.auth.query("SELECT COUNT(*)::int AS count FROM auth_onboarding_rate_limits WHERE scope='IP' AND subject_hash=$1", [sha(forged)])).rows[0].count, 0);
    return { forgedRateIdentities: 0 };
  });

  await check("duplicate email and concurrent registration cannot replace credentials or create two identities", async () => {
    const before = await identity("customer@departamental.local");
    const duplicate = await direct("/auth/register", { method: "POST", body: { name: "Attempted replacement", email: " CUSTOMER@DEPARTAMENTAL.LOCAL ", password: password("different"), browserNonce: nonce() } });
    assert.equal(duplicate.status, 202); assert.equal((await identity(before.email)).password_hash, before.password_hash);
    const address = email("concurrent"), body = { name: "Concurrent customer", email: address, password: password("concurrent"), browserNonce: nonce(), returnPath: "//foreign.example.test" };
    const registered = await Promise.all([direct("/auth/register", { method: "POST", body }), direct("/auth/register", { method: "POST", body })]);
    assert.ok(registered.every(result => result.status === 202)); assert.deepEqual(duplicate.body, registered[0].body);
    const row = await identity(address), challenge = await latestChallenge(row.id), mail = await linkFor(address, challenge);
    assert.equal((await pools.auth.query("SELECT COUNT(*)::int AS count FROM auth_users WHERE lower(email)=$1", [address])).rows[0].count, 1);
    assert.equal((await pools.auth.query("SELECT COUNT(*)::int AS count FROM auth_onboarding_challenges WHERE user_id=$1", [row.id])).rows[0].count, 1);
    const result = await Promise.all([direct("/auth/email-verification/confirm", { method: "POST", body: { token: mail.token, browserNonce: body.browserNonce } }),
      direct("/auth/email-verification/confirm", { method: "POST", body: { token: mail.token, browserNonce: body.browserNonce } })]);
    assert.deepEqual(result.map(item => item.status).sort(), [200, 400]);
    assert.equal(result.find(item => item.status === 200).body.returnPath, "/");
    assert.equal((await pools.auth.query("SELECT COUNT(*)::int AS count FROM auth_onboarding_audit WHERE user_id=$1 AND action='EMAIL_VERIFIED'", [row.id])).rows[0].count, 1);
    assert.equal((await pools.auth.query("SELECT COUNT(*)::int AS count FROM auth_refresh_tokens WHERE user_id=$1", [row.id])).rows[0].count, 0);
  });

  await check("resend cooldown persists and new generation invalidates the previous link", async () => {
    const f = await registerDirect("resend"), old = await linkFor(f.address, f.challenge);
    await pools.auth.query("UPDATE auth_onboarding_email_limits SET last_sent_at=NOW() WHERE email_hash=$1", [sha(f.address)]);
    assert.equal((await direct("/auth/email-verification/resend", { method: "POST", body: { email: f.address } })).status, 202);
    assert.equal((await latestChallenge(f.user.id)).generation, 1);
    await pools.auth.query("UPDATE auth_onboarding_email_limits SET last_sent_at=NOW()-INTERVAL '61 seconds' WHERE email_hash=$1", [sha(f.address)]);
    assert.equal((await direct("/auth/email-verification/resend", { method: "POST", body: { email: f.address } })).status, 202);
    const current = await latestChallenge(f.user.id); assert.equal(current.generation, 2);
    const replacement = await linkFor(f.address, current);
    assert.equal((await direct("/auth/email-verification/confirm", { method: "POST", body: { token: old.token, browserNonce: f.browserNonce } })).status, 400);
    assert.equal((await direct("/auth/employee-invitations/accept", { method: "POST", body: { token: replacement.token, password: f.secret } })).status, 400);
    assert.equal((await direct("/auth/email-verification/confirm", { method: "POST", body: { token: replacement.token, browserNonce: f.browserNonce } })).status, 200);
  });

  let employee;
  await check("ADMIN employee invitation is idempotent and preserves role and null password until acceptance", async () => {
    const address = email("employee"), key = randomUUID(), options = { method: "POST", body: { name: "Integration employee", email: address }, headers: { "Idempotency-Key": key } };
    const results = await Promise.all([adminBrowser.call("/api/auth/employees/invitations", options), adminBrowser.call("/api/auth/employees/invitations", options)]);
    assert.ok(results.every(result => result.status === 202));
    assert.equal(results[0].body.employee.id, results[1].body.employee.id);
    employee = { address, user: results[0].body.employee, secret: password("employee"), challenge: await latestChallenge(results[0].body.employee.id) };
    assert.equal((await identity(address)).password_hash, null); assert.equal((await identity(address)).role, "EMPLOYEE");
    assert.equal((await pools.auth.query("SELECT COUNT(*)::int AS count FROM auth_onboarding_challenges WHERE user_id=$1", [employee.user.id])).rows[0].count, 1);
    assert.equal((await adminBrowser.call("/api/auth/employees/invitations", { ...options, body: { ...options.body, name: "Changed" } })).status, 409);
    assert.equal((await adminBrowser.call("/api/auth/employees/invitations", { ...options, headers: { "Idempotency-Key": randomUUID() } })).status, 409);
    assert.equal((await adminBrowser.call("/api/auth/employees/invitations", { ...options, body: { ...options.body, email: customer.user.email }, headers: { "Idempotency-Key": randomUUID() } })).status, 409);
  });

  await check("EMPLOYEE and CUSTOMER cannot list invite resend or modify employee state directly or through BFF", async () => {
    for (const session of [seedEmployee, customer]) {
      assert.equal((await api("/auth/employees", { token: session.accessToken })).status, 403);
      assert.equal((await api("/auth/employees/invitations", { method: "POST", token: session.accessToken, body: { name: "Denied", email: email("denied") }, headers: { "Idempotency-Key": randomUUID() } })).status, 403);
      assert.equal((await api("/auth/employees/" + employee.user.id + "/status", { method: "PATCH", token: session.accessToken, body: { isActive: false, authVersion: 0 } })).status, 403);
      assert.equal((await api("/auth/employees/" + employee.user.id + "/invitation/resend", { method: "POST", token: session.accessToken })).status, 403);
      const browser = new Browser(session.accessToken); await browser.context();
      assert.equal((await browser.call("/api/auth/employees")).status, 403);
      assert.equal((await browser.call("/api/auth/employees/invitations", { method: "POST", body: { name: "Denied", email: email("denied") }, headers: { "Idempotency-Key": randomUUID() } })).status, 403);
    }
    assert.equal((await api("/auth/employees")).status, 401);
  });

  await check("employee chooses a password with one-use concurrent acceptance and cannot use the verification endpoint", async () => {
    const mail = await linkFor(employee.address, employee.challenge); await settledDelivery(employee.challenge);
    assert.equal((await direct("/auth/login", { method: "POST", body: { email: employee.address, password: employee.secret } })).status, 401);
    assert.equal((await direct("/auth/email-verification/confirm", { method: "POST", body: { token: mail.token, password: employee.secret } })).status, 400);
    const result = await Promise.all([direct("/auth/employee-invitations/accept", { method: "POST", body: { token: mail.token, password: employee.secret } }),
      direct("/auth/employee-invitations/accept", { method: "POST", body: { token: mail.token, password: employee.secret } })]);
    assert.deepEqual(result.map(item => item.status).sort(), [200, 400]);
    employee.session = await login(employee.address, employee.secret);
    assert.equal(employee.session.user.role, "EMPLOYEE");
    assert.equal((await api("/orders", { token: employee.session.accessToken })).status, 200);
    const list = await adminBrowser.call("/api/auth/employees?search=" + encodeURIComponent(employee.address) + "&page=1&pageSize=1");
    assert.equal(list.status, 200); assert.equal(list.body.employees[0].id, employee.user.id); assert.equal(list.body.employees[0].onboardingStatus, "READY");
  });

  await check("private identity and email authorization APIs require purpose credentials and are absent from Kong", async () => {
    const path = "/internal/auth/users/" + employee.user.id + "/status";
    assert.equal((await api(path, { token: admin.accessToken })).status, 404);
    assert.equal((await request(authUrl, path)).status, 401);
    assert.equal((await request(authUrl, path, { headers: { "x-internal-service-key": env.AUTH_ONBOARDING_INTERNAL_SERVICE_KEY } })).status, 401);
    const status = await request(authUrl, path, { headers: { "x-internal-service-key": env.AUTH_STATUS_INTERNAL_SERVICE_KEY } });
    assert.equal(status.status, 200); assert.deepEqual(Object.keys(status.body.user).sort(), ["authVersion", "id", "isActive", "role"]);
    assert.equal(status.body.user.isActive, true);
    const authorization = { challengeId: employee.challenge.id, userId: employee.user.id, purpose: "EMPLOYEE_INVITATION", generation: 1 };
    assert.equal((await api("/internal/auth/onboarding-deliveries/authorize", { method: "POST", token: admin.accessToken, body: authorization })).status, 404);
    assert.equal((await request(authUrl, "/internal/auth/onboarding-deliveries/authorize", { method: "POST", body: authorization })).status, 401);
  });

  await check("deactivation revokes refresh and every protected business API and open socket within 35 seconds", async () => {
    const probes = [
      ["/orders", "GET", undefined, 200], ["/inventory/branches", "GET", undefined, 200], ["/shipments", "GET", undefined, 200],
      ["/promotions", "GET", undefined, 403], ["/customers", "GET", undefined, 403],
      ["/analytics/sales/today", "GET", undefined, 403], ["/products/" + randomUUID(), "PATCH", {}, 403],
    ];
    for (const [path, method, body, expected] of probes) assert.equal((await api(path, { method, body, token: employee.session.accessToken })).status, expected);
    const socket = socketFor(employee.session.accessToken);
    try {
      await connectSocket(socket);
      let disconnectedAt = null;
      socket.once("disconnect", () => { disconnectedAt = Date.now(); });
      const revokedAt = Date.now();
      const disabled = await adminBrowser.call("/api/auth/employees/" + employee.user.id + "/status", { method: "PATCH", body: { isActive: false, authVersion: 0 } });
      assert.equal(disabled.status, 200); assert.equal(disabled.body.employee.authVersion, 1);
      assert.equal((await direct("/auth/refresh", { method: "POST", body: { refreshToken: employee.session.refreshToken } })).status, 401);
      assert.equal((await adminBrowser.call("/api/auth/employees/" + employee.user.id + "/status", { method: "PATCH", body: { isActive: true, authVersion: 0 } })).status, 409);
      await until(async () => {
        const results = await Promise.all(probes.map(([path, method, body]) => api(path, { method, body, token: employee.session.accessToken })));
        return results.every(result => result.status === 401) && disconnectedAt !== null;
      }, 35_000);
      const blockedAfterMilliseconds = Date.now() - revokedAt;
      assert.ok(blockedAfterMilliseconds <= 35_000); assert.ok(disconnectedAt - revokedAt <= 35_000);
      employee.disabledVersion = 1;
      return { protectedServices: 7, apiBlockedAfterMilliseconds: blockedAfterMilliseconds, socketBlockedAfterMilliseconds: disconnectedAt - revokedAt };
    } finally { socket.disconnect(); }
  });

  await check("reactivation requires new login and keeps previous access and refresh tokens revoked", async () => {
    const result = await adminBrowser.call("/api/auth/employees/" + employee.user.id + "/status", { method: "PATCH", body: { isActive: true, authVersion: employee.disabledVersion } });
    assert.equal(result.status, 200); assert.equal(result.body.employee.authVersion, 2);
    assert.equal((await api("/orders", { token: employee.session.accessToken })).status, 401);
    assert.equal((await direct("/auth/refresh", { method: "POST", body: { refreshToken: employee.session.refreshToken } })).status, 401);
    employee.newSession = await login(employee.address, employee.secret);
    assert.equal(employee.newSession.user.authVersion, 2);
    assert.equal((await api("/orders", { token: employee.newSession.accessToken })).status, 200);
    const old = socketFor(employee.session.accessToken);
    try { await assert.rejects(() => connectSocket(old)); } finally { old.disconnect(); }
    const current = socketFor(employee.newSession.accessToken);
    try { await connectSocket(current); } finally { current.disconnect(); }
    assert.equal((await adminBrowser.call("/api/auth/employees/" + customer.user.id + "/status", { method: "PATCH", body: { isActive: false, authVersion: 0 } })).status, 404);
  });

  await check("employee resend retires old invitation and disabling then enabling does not revive it", async () => {
    const f = await invite(adminBrowser, "pending-employee"), old = await linkFor(f.address, f.challenge);
    await pools.auth.query("UPDATE auth_onboarding_email_limits SET last_sent_at=NOW() WHERE email_hash=$1", [sha(f.address)]);
    assert.equal((await adminBrowser.call("/api/auth/employees/" + f.user.id + "/invitation/resend", { method: "POST", body: {} })).status, 429);
    await pools.auth.query("UPDATE auth_onboarding_email_limits SET last_sent_at=NOW()-INTERVAL '61 seconds' WHERE email_hash=$1", [sha(f.address)]);
    assert.equal((await adminBrowser.call("/api/auth/employees/" + f.user.id + "/invitation/resend", { method: "POST", body: {} })).status, 202);
    const newer = await latestChallenge(f.user.id), replacement = await linkFor(f.address, newer);
    assert.equal((await direct("/auth/employee-invitations/accept", { method: "POST", body: { token: old.token, password: password("pending") } })).status, 400);
    assert.equal((await adminBrowser.call("/api/auth/employees/" + f.user.id + "/status", { method: "PATCH", body: { isActive: false, authVersion: 0 } })).status, 200);
    assert.equal((await adminBrowser.call("/api/auth/employees/" + f.user.id + "/status", { method: "PATCH", body: { isActive: true, authVersion: 1 } })).status, 200);
    assert.equal((await direct("/auth/employee-invitations/accept", { method: "POST", body: { token: replacement.token, password: password("pending") } })).status, 400);
    assert.equal((await identity(f.address)).onboarding_status, "PENDING_INVITATION");
  });

  await check("expired verification cannot activate an account", async () => {
    const f = await registerDirect("expired"), mail = await linkFor(f.address, f.challenge);
    await pools.auth.query("UPDATE auth_onboarding_challenges SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [f.challenge.id]);
    assert.equal((await direct("/auth/email-verification/confirm", { method: "POST", body: { token: mail.token, browserNonce: f.browserNonce } })).status, 400);
    assert.equal((await identity(f.address)).onboarding_status, "PENDING_EMAIL");
  });

  let outage, simulation, expiredBeforeSend, revokedBeforeSend;
  await check("Rabbit outage preserves encrypted outbox atomically with pending identities", async () => {
    await stop("servicio-notificaciones"); await stop("rabbitmq"); await sleep(1_500);
    outage = await registerDirect("outage");
    simulation = await registerDirect("simulated");
    expiredBeforeSend = await registerDirect("expire-before-send");
    revokedBeforeSend = await invite(adminBrowser, "revoke-before-send");
    for (const f of [outage, simulation, expiredBeforeSend, revokedBeforeSend]) {
      const row = (await pools.auth.query("SELECT payload,published_at FROM auth_onboarding_outbox WHERE challenge_id=$1", [f.challenge.id])).rows[0];
      assert.equal(row.published_at, null);
      assert.equal(typeof row.payload.encrypted?.ciphertext, "string");
      assert.equal(Buffer.from(row.payload.encrypted.iv, "base64url").length, 12);
      assert.equal(Buffer.from(row.payload.encrypted.tag, "base64url").length, 16);
      assert.match(f.challenge.token_hash, /^[a-f0-9]{64}$/);
      assert.equal(JSON.stringify(row.payload).includes(f.address), false);
      assert.equal("token" in row.payload, false);
      f.event = row.payload;
    }
    await pools.auth.query("UPDATE auth_onboarding_challenges SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [expiredBeforeSend.challenge.id]);
    assert.equal((await adminBrowser.call("/api/auth/employees/" + revokedBeforeSend.user.id + "/status", { method: "PATCH", body: { isActive: false, authVersion: 0 } })).status, 200);
  });

  await check("simulation remains unverified and SMTP retry attempts are bounded in isolated delivery workers", async () => {
    const { OnboardingDeliveryService } = notificationRequire("./dist/onboarding/onboarding-delivery.service.js");
    const { AuthOnboardingClient } = notificationRequire("./dist/onboarding/auth-onboarding.client.js");
    const authorization = new AuthOnboardingClient({ authServiceUrl: authUrl, authOnboardingInternalServiceKey: env.AUTH_ONBOARDING_INTERNAL_SERVICE_KEY });
    const configuration = { environment: "test", onboardingEmailKey: env.ONBOARDING_EMAIL_KEY, retryIntervalSeconds: 1, retryLimit: 2 };
    const simulated = new OnboardingDeliveryService(database(pools.notification), authorization,
      { sendOnboarding: async () => ({ messageId: "simulation-fixture", simulated: true }) }, configuration);
    await simulated.receive(simulation.event);
    const row = (await pools.notification.query("SELECT status,attempts,encrypted_content FROM notification_onboarding_deliveries WHERE challenge_id=$1", [simulation.challenge.id])).rows[0];
    assert.equal(row.status, "SIMULATED"); assert.equal(row.attempts, 1); assert.equal(row.encrypted_content, null);
    assert.equal((await identity(simulation.address)).onboarding_status, "PENDING_EMAIL");
    let calls = 0;
    const retryFixture = await registerDirect("bounded-retry");
    const event = (await pools.auth.query("SELECT payload FROM auth_onboarding_outbox WHERE challenge_id=$1", [retryFixture.challenge.id])).rows[0].payload;
    const failing = new OnboardingDeliveryService(database(pools.notification), authorization,
      { sendOnboarding: async () => { calls++; throw new Error("Fixture SMTP outage"); } }, configuration);
    await failing.receive(event);
    await pools.notification.query("UPDATE notification_onboarding_deliveries SET next_retry_at=NOW() WHERE challenge_id=$1", [retryFixture.challenge.id]);
    await failing.retryDue(); await failing.retryDue();
    assert.equal(calls, 2);
    const failed = (await pools.notification.query("SELECT status,attempts,next_retry_at,encrypted_content FROM notification_onboarding_deliveries WHERE challenge_id=$1", [retryFixture.challenge.id])).rows[0];
    assert.equal(failed.status, "FAILED"); assert.equal(failed.attempts, 2); assert.equal(failed.next_retry_at, null); assert.equal(failed.encrypted_content, null);
    assert.equal((await identity(retryFixture.address)).onboarding_status, "PENDING_EMAIL");
    // Prevent the live worker's independently configured retryLimit from retrying this terminal fixture.
    await pools.auth.query("UPDATE auth_onboarding_challenges SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [retryFixture.challenge.id]);
    return { simulatedAccountsActivated: 0, failedProviderAttempts: calls };
  });

  await check("outbox and SMTP recover after Rabbit and Notification restart without duplicate messages", async () => {
    await start("rabbitmq"); await start("servicio-notificaciones");
    await linkFor(outage.address, outage.challenge); await settledDelivery(outage.challenge);
    await until(async () => (await latestChallenge(simulation.user.id)).delivery_status === "SIMULATED", 45_000);
    assert.equal((await identity(simulation.address)).onboarding_status, "PENDING_EMAIL");
    const before = (await messages(outage.address)).length;
    assert.equal(before, 1);
    compose("restart", "servicio-notificaciones");
    await until(() => inspect("servicio-notificaciones").State.Health?.Status === "healthy", 60_000);
    await sleep(2_000);
    assert.equal((await messages(outage.address)).length, before);
    assert.equal((await messages(expiredBeforeSend.address)).length, 0);
    assert.equal((await messages(revokedBeforeSend.address)).length, 0);
    assert.equal((await messages(simulation.address)).length, 0);
    return { recoveredMessages: before, duplicateMessages: 0, expiredOrRevokedMessages: 0 };
  });

  await check("public request limits remain atomic and survive Auth service restart", async () => {
    const ip = uniqueIp(), limit = Number(env.AUTH_ONBOARDING_IP_LIMIT || 10);
    assert.ok(limit <= 100);
    for (let i = 0; i < limit; i++) assert.equal((await direct("/auth/email-verification/resend", { method: "POST", body: { email: email("unknown") }, headers: clientHeaders(ip) })).status, 202);
    assert.equal((await direct("/auth/email-verification/resend", { method: "POST", body: { email: email("unknown") }, headers: clientHeaders(ip) })).status, 429);
    compose("restart", "servicio-autenticacion");
    await until(() => inspect("servicio-autenticacion").State.Health?.Status === "healthy", 60_000);
    assert.equal((await direct("/auth/email-verification/resend", { method: "POST", body: { email: email("unknown") }, headers: clientHeaders(ip) })).status, 429);
    return { configuredLimit: limit };
  });

  await check("terminal ciphertext is removed, audit and service logs exclude secrets, and previous identities remain intact", async () => {
    await until(async () => !(await pools.auth.query("SELECT 1 FROM auth_onboarding_outbox o JOIN auth_onboarding_challenges c ON c.id=o.challenge_id WHERE o.payload ? 'encrypted' AND c.user_id IN (SELECT id FROM auth_users WHERE email LIKE $1) AND (c.delivery_terminal=TRUE OR c.consumed_at IS NOT NULL OR c.revoked_at IS NOT NULL OR c.expires_at<=NOW())", ["accounts-" + runId.slice(0, 12) + "-%"])).rows.length, 30_000);
    const audits = JSON.stringify((await pools.auth.query("SELECT * FROM auth_onboarding_audit WHERE user_id IN (SELECT id FROM auth_users WHERE email LIKE $1)", ["accounts-" + runId.slice(0, 12) + "-%"])).rows);
    for (const value of sensitive) assert.equal(audits.includes(value), false);
    for (const service of ["servicio-autenticacion", "servicio-notificaciones", "aplicacion-web", "pasarela-api"]) {
      const captured = spawnSync("docker", ["logs", "--since", startedAt, project + "-" + service + "-1"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      assert.equal(captured.status, 0);
      const logs = captured.stdout + captured.stderr;
      for (const value of sensitive) assert.equal(logs.includes(value), false);
    }
    const existing = (await pools.auth.query("SELECT id,email,name,password_hash,role FROM auth_users WHERE id=ANY($1::uuid[]) ORDER BY id", [initialUsers.map(user => user.id)])).rows;
    assert.equal(sha(JSON.stringify(existing)), baselineUsersHash);
    return { previousIdentitiesPreserved: existing.length, sensitiveValuesWrittenToReport: 0 };
  });
  save(true);
  console.log("All " + checks.length + " account checks passed.");
} catch {
  if (!checks.some(check => !check.passed)) { checks.push({ name: "runner infrastructure", passed: false, failure: "INTEGRATION_FAILED" }); save(false); }
  console.error("Account integration failed; see the sanitized verification report.");
  process.exitCode = 1;
} finally {
  for (const service of stopped) { try { compose("start", service); } catch { process.exitCode = 1; } }
  await Promise.all(Object.values(pools).map(pool => pool.end()));
}
