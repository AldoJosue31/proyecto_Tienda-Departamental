import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// HTTP reads and temporary login sessions only. No sales, campaigns, stock
// adjustments, direct database access, container stops, or secrets in the report.
const environment = process.argv.includes("--business") ? "business" : "integration";
const project = environment === "integration" ? "departamental-five-phases" : "web";
const gateway = environment === "integration" ? "http://localhost:8005" : "http://localhost:8000";
const origin = environment === "integration" ? "http://localhost:3105" : "http://localhost:3005";
const auditDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const env = Object.fromEntries(readFileSync(environment === "integration" ? ".env.integration" : ".env", "utf8")
  .split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith("#"))
  .map(line => { const at = line.indexOf("="); return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^(["'])(.*)\1$/, "$2")]; }));
const checks = [];
const sessions = [];
const record = (name, passed, detail) => {
  checks.push({ name, passed, ...detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail?.status ? ` (HTTP ${detail.status})` : ""}`);
};
async function request(path, { token, method = "GET", body, requestOrigin } = {}) {
  try {
    const response = await fetch(gateway + path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(requestOrigin ? { Origin: requestOrigin } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(12000),
    });
    const json = (response.headers.get("content-type") ?? "").includes("application/json");
    const value = json ? await response.json().catch(() => null) : null;
    return { status: response.status, json, code: typeof value?.code === "string" ? value.code : null,
      allowOrigin: response.headers.get("access-control-allow-origin"),
      correlationId: Boolean(response.headers.get("x-correlation-id")), value };
  } catch { return { status: null, json: false, code: "UNREACHABLE", allowOrigin: null, correlationId: false }; }
}
const safe = result => ({ status: result.status, json: result.json, code: result.code, allowOrigin: result.allowOrigin, correlationId: result.correlationId });

const containerIds = execFileSync("docker", ["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`], { encoding: "utf8" }).trim().split(/\s+/).filter(Boolean);
if (!containerIds.length) throw new Error(`No containers found for ${project}.`);
const containers = JSON.parse(execFileSync("docker", ["inspect", ...containerIds], { encoding: "utf8" })).map(item => ({
  service: item.Config.Labels["com.docker.compose.service"],
  state: item.State.Status, health: item.State.Health?.Status ?? null,
  createdAt: item.Created, imageId: item.Image,
  networks: Object.keys(item.NetworkSettings.Networks),
}));
const activeContainers = containers.filter(item => !["postgres", "redis"].includes(item.service));
record("active containers running and healthy", activeContainers.every(item => item.state === "running" && (!item.health || item.health === "healthy")), { count: activeContainers.length, legacyContainers: containers.length - activeContainers.length });

try {
  const publicResult = await request("/products", { requestOrigin: origin });
  record("public catalog JSON via Gateway with allowed CORS", publicResult.status === 200 && publicResult.json && publicResult.allowOrigin === origin, safe(publicResult));
  const denied = await request("/products", { requestOrigin: "https://unauthorized.example" });
  record("unlisted origin does not receive CORS permission or server error", denied.status !== null && denied.status < 500 && denied.allowOrigin !== "https://unauthorized.example", safe(denied));
  for (const path of ["/auth/me", "/inventory", "/analytics/sales/today", "/customers", "/shipments", "/promotions"]) {
    const result = await request(path);
    record(`JWT required ${path}`, result.status === 401 && result.json, safe(result));
  }
  for (const role of ["admin", "customer"]) {
    const password = env[`SEED_${role.toUpperCase()}_PASSWORD`];
    if (!password) { record(`${role} login configured`, false, { code: "MISSING_SEED_PASSWORD" }); continue; }
    const result = await request("/auth/login", { method: "POST", body: { email: `${role}@departamental.local`, password } });
    const token = result.value?.accessToken;
    record(`${role} login`, result.status === 200 && typeof token === "string", safe(result));
    if (typeof token !== "string") continue;
    sessions.push(result.value);
    const paths = role === "admin" ? ["/auth/me", "/inventory", "/analytics/sales/today", "/promotions", "/orders", "/shipments", "/customers", "/auth/users"] : ["/inventory", "/analytics/sales/today", "/customers", "/auth/users"];
    for (const path of paths) {
      const response = await request(path, { token });
      const expected = role === "admin" ? 200 : 403;
      record(`${role} access ${path}`, response.status === expected && response.json, { expected, ...safe(response) });
    }
  }
  for (let iteration = 0; iteration < 2; iteration++) await request("/products?search=aurora");
  const redisContainer = `${project}-catalog-redis-1`;
  const keys = execFileSync("docker", ["exec", redisContainer, "redis-cli", "--scan", "--pattern", "catalog:search:*"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
  const ttl = keys.length ? Number(execFileSync("docker", ["exec", redisContainer, "redis-cli", "TTL", keys[0]], { encoding: "utf8" }).trim()) : null;
  record("Redis contains search responses with TTL", keys.length > 0 && ttl > 0, { keys: keys.length, sampleTtlSeconds: ttl });
} finally {
  for (const session of sessions) if (session.refreshToken) await request("/auth/logout", { method: "POST", body: { refreshToken: session.refreshToken } });
  const report = { completedAt: new Date().toISOString(), timezone: "America/Mexico_City", environment, project, gateway, origin,
    scope: "Runtime HTTP reads, temporary authentication sessions, Docker status and Redis cache inspection. No end-to-end sales or message delivery.",
    checks, containers };
  writeFileSync(`docs/audit-runtime-${environment}-${auditDate}.json`, JSON.stringify(report, null, 2) + "\n");
}
if (checks.some(check => !check.passed)) process.exitCode = 1;
