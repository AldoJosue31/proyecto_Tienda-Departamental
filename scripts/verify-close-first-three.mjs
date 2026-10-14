import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";

const project = "departamental-five-phases", gateway = "http://localhost:8005", web = "http://localhost:3105";
const env = Object.fromEntries(readFileSync(".env.integration", "utf8").split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1).replace(/^(['"])(.*)\1$/, "$2")]; }));
assert.equal(env.COMPOSE_PROJECT_NAME, project);
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] });
const inspect = service => JSON.parse(docker("inspect", `${project}-${service}-1`))[0];
for (const service of ["inventory-postgres", "orders-postgres", "servicio-precios", "rabbitmq"]) assert.equal(inspect(service).Config.Labels["com.docker.compose.project"], project);
const compose = (...args) => docker("compose", "-p", project, "--env-file", ".env.integration", "-f", "compose.yaml", "-f", "compose.integration.yaml", ...args);
const pool = new pg.Pool({ host: "127.0.0.1", port: 55433, database: "inventory_service", user: "inventory_service", password: env.INVENTORY_DB_PASSWORD });
const orders = new pg.Pool({ host: "127.0.0.1", port: 55435, database: "orders_service", user: "orders_service", password: env.ORDERS_DB_PASSWORD });
const analytics = new pg.Pool({ host: "127.0.0.1", port: 55437, database: "analytics_service", user: "analytics_service", password: env.ANALYTICS_DB_PASSWORD });
analytics.on("error", () => undefined);
const checks = [], stopped = new Set(); let promotionId;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(operation, milliseconds = 35000) { const start = Date.now(); while (Date.now() - start < milliseconds) { try { if (await operation()) return; } catch { /* dependencies may be recovering */ } await sleep(300); } throw new Error("State did not recover within its bound"); }
async function check(name, operation) { const start = Date.now(); const detail = await operation(); checks.push({ name, passed: true, milliseconds: Date.now() - start, ...detail }); console.log("PASS " + name); }
async function api(path, { token, method = "GET", body, origin, headers = {}, base = gateway } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...(origin ? { Origin: origin } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  return { status: response.status, body: await response.json().catch(() => null), headers: response.headers };
}
const login = async role => { const result = await api("/auth/login", { method: "POST", body: { email: `${role}@departamental.local`, password: env[`SEED_${role.toUpperCase()}_PASSWORD`] } }); assert.equal(result.status, 200, "Gateway login " + role); return result.body; };
let admin, customer, failure;
try {
  admin = await login("admin"); customer = await login("customer");
  const adminToken = admin.accessToken, token = customer.accessToken;
  const cookie = { Cookie: `departamental_access=${token}`, Origin: web };
  // Kong may still be refreshing a DNS entry after Compose recreates a service.
  await until(async () => (await api("/inventory", { token: adminToken })).status === 200 && (await api("/products")).status === 200, 60000);
  await check("compatible Auth identity contracts and roles", async () => {
    assert.ok(Number.isSafeInteger(JSON.parse(Buffer.from(token.split(".")[1], "base64url")).uv));
    assert.equal((await api("/inventory", { token: adminToken })).status, 200);
    assert.equal((await api("/inventory", { token })).status, 403);
    assert.equal((await api("/inventory")).status, 401);
  });
  await check("CORS rejects GET POST OPTIONS without 500 and permits valid preflight", async () => {
    for (const method of ["GET", "POST", "OPTIONS"]) {
      const denied = await api("/products", { method, origin: "https://unlisted.example", ...(method === "POST" ? { body: {} } : {}) });
      assert.equal(denied.status, 403); assert.notEqual(denied.headers.get("access-control-allow-origin"), "https://unlisted.example");
    }
    const allowed = await api("/pricing/cart/quote", { method: "OPTIONS", origin: web, headers: { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
    assert.ok([200, 204].includes(allowed.status)); assert.equal(allowed.headers.get("access-control-allow-origin"), web);
    assert.equal((await api("/realtime/socket.io/?EIO=4&transport=polling", { origin: "https://unlisted.example" })).status, 403);
  });
  await check("cookie BFF rejects missing, forged and cross-site Origin before mutation", async () => {
    for (const headers of [ { Cookie: cookie.Cookie }, { ...cookie, Origin: "https://unlisted.example" }, { ...cookie, "Sec-Fetch-Site": "same-site" }, { ...cookie, "Content-Type": "text/plain" } ]) {
      const denied = await api("/api/checkout", { base: web, method: "POST", headers, body: {} });
      assert.equal(denied.status, 403); assert.equal(denied.body.code, "ORIGIN_NOT_ALLOWED"); assert.ok(denied.headers.get("x-correlation-id"));
    }
  });
  await check("PostgreSQL data networks are restricted to domain owners", async () => {
    const services = { auth: "servicio-autenticacion", catalog: "servicio-catalogo", inventory: "servicio-inventario", pricing: "servicio-precios", orders: "servicio-pedidos", analytics: "servicio-analitica", logistics: "servicio-logistica", crm: "servicio-clientes", notification: "servicio-notificaciones" };
    for (const [domain, service] of Object.entries(services)) {
      const db = inspect(domain + "-postgres"), app = inspect(service);
      assert.ok(db.NetworkSettings.Networks[project + "_" + domain + "-data"]);
      assert.ok(!db.NetworkSettings.Networks[project + "_" + domain + "-internal"]);
      assert.deepEqual(Object.keys(db.NetworkSettings.Networks).sort(), [project + "_" + domain + "-data", project + "_" + domain + "-probe"].sort());
      assert.deepEqual(Object.keys(app.NetworkSettings.Networks).filter(name => name.endsWith("-data")), [project + "_" + domain + "-data"]);
      assert.equal(new URL(Object.fromEntries(app.Config.Env.map(value => { const at = value.indexOf("="); return [value.slice(0, at), value.slice(at + 1)]; })).DATABASE_URL).hostname, domain + "-postgres");
    }
    assert.ok(Object.keys(inspect("pasarela-api").NetworkSettings.Networks).every(name => !name.endsWith("-data")));
  });
  // Remove only this runner's abandoned, synthetic promotions after a failed run.
  const previousPromotions = (await api("/promotions", { token: adminToken })).body.promotions;
  for (const promotion of previousPromotions.filter(p => p.name.startsWith("Cierre tres fases "))) assert.ok([200, 204].includes((await api("/promotions/" + promotion.id, { token: adminToken, method: "DELETE" })).status));
  const catalog = (await api("/products")).body.items;
  const branchId = (await api("/inventory/branches", { token: adminToken })).body.branches[0].id;
  const stock = (await api(`/inventory/branches/${branchId}`, { token: adminToken })).body.items.find(stock => catalog.some(product => product.variants.some(variant => variant.id === stock.variantId)));
  const product = catalog.find(product => product.variants.some(variant => variant.id === stock.variantId)), variant = product.variants.find(variant => variant.id === stock.variantId);
  const item = { productId: product.id, variantId: variant.id, quantity: 1 };
  await pool.query("UPDATE inventory_stock SET on_hand=50,reserved=0,revision=revision+1 WHERE branch_id=$1 AND variant_id=$2", [branchId, variant.id]);
  const definition = { name: "Cierre tres fases " + randomUUID().slice(0, 8), discountType: "PERCENTAGE", discountValue: 20, priority: 1000, startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), timezone: "America/Mexico_City", targets: [{ scope: "VARIANT", targetId: variant.id }] };
  const created = await api("/promotions", { token: adminToken, method: "POST", body: definition }); assert.equal(created.status, 201); promotionId = created.body.promotion.id;
  const expected = value => Math.round(value * 100) / 100;
  await check("batch quote uses Catalog prices and rejects forged browser amounts", async () => {
    const result = await api("/pricing/quotes", { method: "POST", body: { items: [item] } });
    assert.equal(result.status, 200); assert.equal(result.body.quotes[0].effectivePrice, expected(variant.listPrice * 0.8));
    assert.equal((await api("/pricing/quotes", { method: "POST", body: { items: [{ ...item, basePrice: 1 }] } })).status, 400);
    assert.equal((await api("/pricing/quotes", { method: "POST", body: { items: Array(101).fill(item) } })).status, 400);
    assert.equal((await api("/pricing/cart/quote", { method: "POST", body: { items: [item] } })).status, 401);
  });
  const quote = await api("/api/pricing/cart", { base: web, method: "POST", headers: cookie, body: { items: [item] } }); assert.equal(quote.status, 200);
  await check("catalog details and cart show the same effective price", async () => {
    const resolved = await api("/api/catalog/resolve", { base: web, method: "POST", body: { ids: [product.id] } });
    assert.equal(resolved.status, 200);
    const page = await api("/api/catalog?pageSize=100", { base: web });
    const priced = page.body.items.find(p => p.id === product.id).variants.find(v => v.id === variant.id);
    const detail = await api("/api/catalog/products/" + product.id, { base: web });
    assert.equal(priced.price.effectivePrice, quote.body.total);
    assert.equal(detail.body.product.variants.find(v => v.id === variant.id).price.effectivePrice, quote.body.total);
    assert.equal(quote.body.discountTotal, expected(variant.listPrice - quote.body.total));
  });
  const before = (await pool.query("SELECT on_hand,reserved FROM inventory_stock WHERE branch_id=$1 AND variant_id=$2", [branchId, variant.id])).rows[0];
  const changedDefinition = { ...definition, discountValue: 30 };
  assert.equal((await api("/promotions/" + promotionId, { token: adminToken, method: "PATCH", body: changedDefinition })).status, 200);
  const orderBody = { branchId, items: [item], expectedTotal: quote.body.total };
  await check("changed displayed total rejects before any stock reservation", async () => {
    const result = await api("/api/checkout", { base: web, method: "POST", headers: { ...cookie, "Idempotency-Key": randomUUID() }, body: orderBody });
    assert.equal(result.status, 409); assert.equal(result.body.code, "PRICE_CHANGED");
    assert.deepEqual((await pool.query("SELECT on_hand,reserved FROM inventory_stock WHERE branch_id=$1 AND variant_id=$2", [branchId, variant.id])).rows[0], before);
  });
  const refreshed = await api("/api/pricing/cart", { base: web, method: "POST", headers: cookie, body: { items: [item] } });
  const key = randomUUID(); let confirmed;
  await check("new confirmation charges displayed amount and replay preserves snapshot", async () => {
    const result = await api("/api/checkout", { base: web, method: "POST", headers: { ...cookie, "Idempotency-Key": key }, body: { ...orderBody, expectedTotal: refreshed.body.total } });
    assert.equal(result.status, 201); confirmed = result.body.order;
    assert.equal(confirmed.total, refreshed.body.total);
    const replay = await api("/api/checkout", { base: web, method: "POST", headers: { ...cookie, "Idempotency-Key": key }, body: { ...orderBody, expectedTotal: variant.listPrice } });
    assert.equal(replay.body.order.id, confirmed.id); assert.equal(replay.body.order.total, confirmed.total);
    assert.equal((await pool.query("SELECT on_hand FROM inventory_stock WHERE branch_id=$1 AND variant_id=$2", [branchId, variant.id])).rows[0].on_hand, before.on_hand - 1);
  });
  await check("Pricing process survives PostgreSQL interruption and reconnects", async () => {
    const startedAt = inspect("servicio-precios").State.StartedAt;
    compose("stop", "pricing-postgres"); stopped.add("pricing-postgres"); await sleep(1500);
    assert.equal((await api("/pricing/quotes", { method: "POST", body: { items: [item] } })).status, 503);
    assert.equal(inspect("servicio-precios").State.Running, true);
    compose("start", "pricing-postgres"); stopped.delete("pricing-postgres");
    await until(async () => (await api("/pricing/quotes", { method: "POST", body: { items: [item] } })).status === 200);
    assert.equal(inspect("servicio-precios").State.StartedAt, startedAt);
  });
  await check("Docker restart policy restores a crashed Pricing process", async () => {
    const beforeStart = inspect("servicio-precios").State.StartedAt;
    assert.equal(inspect("servicio-precios").HostConfig.RestartPolicy.Name, "unless-stopped");
    // An explicit Docker kill suppresses the restart policy; namespace PID 1
    // also ignores signals from descendants. A read-only helper sends SIGKILL
    // from the Linux host namespace, checking the exact cgroup before signaling.
    try {
      const target = inspect("servicio-precios");
      assert.equal(target.Config.Labels["com.docker.compose.project"], project);
      assert.ok(target.State.Running && target.State.Pid > 1);
      const abort = `const fs=require('node:fs');const pid=${target.State.Pid};if(!fs.readFileSync('/proc/'+pid+'/cgroup','utf8').includes('${target.Id}')||fs.readFileSync('/proc/'+pid+'/cmdline','utf8')!=='node\\0dist/main.js\\0')throw Error('CRASH_TARGET_MISMATCH');process.kill(pid,'SIGKILL');`;
      docker("run", "--rm", "--read-only", "--network", "none", "--pid=host", "--cap-drop=ALL", "--cap-add=KILL", "--user=0", "--entrypoint=node", target.Image, "-e", abort);
      await until(async () => inspect("servicio-precios").State.StartedAt !== beforeStart && (await api("/pricing/quotes", { method: "POST", body: { items: [item] } })).status === 200);
    } finally { if (!inspect("servicio-precios").State.Running) compose("start", "servicio-precios"); }
  });
  await check("sales persist outbox during broker outage and publish after recovery", async () => {
    compose("stop", "rabbitmq"); stopped.add("rabbitmq");
    const sale = await api("/orders", { token: adminToken, method: "POST", headers: { "Idempotency-Key": randomUUID() }, body: { branchId, channel: "PHYSICAL", customerId: customer.user.id, items: [item] } });
    assert.equal(sale.status, 201);
    assert.ok((await orders.query("SELECT id FROM orders_outbox_events WHERE payload->>'orderId'=$1 AND published_at IS NULL", [sale.body.order.id])).rowCount >= 1);
    compose("start", "rabbitmq"); stopped.delete("rabbitmq");
    await until(async () => (await orders.query("SELECT COUNT(*)::int AS n FROM orders_outbox_events WHERE payload->>'orderId'=$1 AND published_at IS NULL", [sale.body.order.id])).rows[0].n === 0);
  });
  await check("unavailable Analytics and Notification do not stop catalog or sales", async () => {
    for (const service of ["servicio-analitica", "servicio-notificaciones"]) { compose("stop", service); stopped.add(service); }
    assert.equal((await api("/products")).status, 200);
    const result = await api("/orders", { token: adminToken, method: "POST", headers: { "Idempotency-Key": randomUUID() }, body: { branchId, channel: "PHYSICAL", customerId: customer.user.id, items: [item] } }); assert.equal(result.status, 201);
    for (const service of ["servicio-analitica", "servicio-notificaciones"]) { compose("start", service); stopped.delete(service); }
    await until(async () => (await api("/analytics/sales/today", { token: adminToken })).status === 200);
  });
  await check("valid Analytics event retries a database outage and projects once", async () => {
    const startedAt = inspect("servicio-analitica").State.StartedAt;
    compose("stop", "analytics-postgres"); stopped.add("analytics-postgres");
    const sale = await api("/orders", { token: adminToken, method: "POST", headers: { "Idempotency-Key": randomUUID() }, body: { branchId, channel: "PHYSICAL", customerId: customer.user.id, items: [item] } });
    assert.equal(sale.status, 201); await sleep(1500);
    compose("start", "analytics-postgres"); stopped.delete("analytics-postgres");
    await until(async () => (await analytics.query("SELECT COUNT(*)::int AS n FROM analytics_order_projection WHERE order_id=$1", [sale.body.order.id])).rows[0].n === 1);
    assert.equal(inspect("servicio-analitica").State.StartedAt, startedAt);
  });
  await check("retired Next scheduler is absent and legacy has no active consumer", async () => {
    assert.equal((await api("/api/internal/run-scheduler", { base: web, method: "POST" })).status, 404);
    const app = inspect("aplicacion-web");
    assert.ok(!app.Config.Env.some(value => /^(DATABASE_URL|REDIS_URL|USE_POSTGRES_PERSISTENCE|SCHEDULER_SECRET)=/.test(value)));
    assert.ok(!app.NetworkSettings.Networks[project + "_legacy-internal"]);
  });
} catch (error) {
  process.exitCode = 1;
  failure = error instanceof Error ? error.message : "Unknown failure";
  console.error("FAIL first-three-phase integration: " + (error instanceof Error ? error.message : "Unknown failure"));
} finally {
  for (const service of [...stopped].reverse()) try { compose("start", service); } catch { process.exitCode = 1; }
  if (promotionId && admin) await api("/promotions/" + promotionId, { token: admin.accessToken, method: "DELETE" }).catch(() => undefined);
  for (const session of [admin, customer]) if (session?.refreshToken) await api("/auth/logout", { method: "POST", body: { refreshToken: session.refreshToken } }).catch(() => undefined);
  await pool.end(); await orders.end(); await analytics.end();
  writeFileSync("docs/verification-close-first-three.json", JSON.stringify({ completedAt: new Date().toISOString(), project, passed: process.exitCode !== 1, failure, checks }, null, 2) + "\n");
}
