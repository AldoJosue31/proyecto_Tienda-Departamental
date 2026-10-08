import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { io } from "socket.io-client";

// Deliberately no DATABASE_URL override: this runner can only reach its own
// Compose databases on fixed loopback ports and verifies their project labels.
const env = Object.fromEntries(readFileSync(".env.integration", "utf8").trim().split(/\r?\n/).map((line) => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
assert.equal(env.COMPOSE_PROJECT_NAME, "departamental-five-phases");
const domains = { inventory: 55433, analytics: 55437, pricing: 55434, crm: 55439 };
const pools = {};
const databases = {};
const results = [];
const sockets = [];
const load = (domain, module) => createRequire(new URL(`../services/${domain}-service/package.json`, import.meta.url))(`./dist/${module}.js`);
for (const [domain, port] of Object.entries(domains)) {
  const container = `departamental-five-phases-${domain}-postgres-1`;
  const project = execFileSync("docker", ["inspect", "--format", '{{ index .Config.Labels "com.docker.compose.project" }}', container], { encoding: "utf8" }).trim();
  assert.equal(project, "departamental-five-phases");
  const pool = new pg.Pool({ host: "127.0.0.1", port, database: `${domain}_service`, user: `${domain}_service`, password: env[domain.toUpperCase() + "_DB_PASSWORD"] });
  pools[domain] = pool;
  databases[domain] = { query: (sql, values) => pool.query(sql, values), withTransaction: async (operation) => {
    const client = await pool.connect();
    try { await client.query("BEGIN"); const result = await operation(client); await client.query("COMMIT"); return result; }
    catch (failure) { await client.query("ROLLBACK"); throw failure; }
    finally { client.release(); }
  } };
}
async function check(name, operation) { const start = Date.now(); const detail = await operation(); results.push({ name, passed: true, milliseconds: Date.now() - start, ...(detail ?? {}) }); console.log(`PASS ${name}`); }
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function until(operation, timeout = 15000) { const started = Date.now(); while (Date.now() - started < timeout) { const value = await operation(); if (value) return value; await sleep(200); } throw new Error("Timed out waiting for integration state"); }
const fixtureBranch = "d1000000-0000-4000-8000-000000000001";
const fixtureVariant = "d2000000-0000-4000-8000-000000000001";
const fixtureCreator = "d3000000-0000-4000-8000-000000000001";

async function prepare() {
  for (const domain of Object.keys(domains)) {
    await databases[domain].withTransaction(async (client) => {
      const ledger = `${domain}_schema_migrations`;
      await client.query(`CREATE TABLE IF NOT EXISTS ${ledger} (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      const applied = new Set((await client.query(`SELECT name FROM ${ledger}`)).rows.map((row) => row.name));
      for (const file of readdirSync(`services/${domain}-service/migrations`).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
        if (applied.has(file)) continue;
        // Insert historical records before the new migration, not after it.
        if (domain === "inventory" && file.startsWith("003")) {
          await client.query("INSERT INTO inventory_branches (id, name) VALUES ($1, 'Sucursal prueba migración')", [fixtureBranch]);
          await client.query("INSERT INTO inventory_variant_snapshots (variant_id, product_name, sku, variant_label) VALUES ($1, 'Registro anterior', 'MIGRATION-01', 'Anterior')", [fixtureVariant]);
          await client.query("INSERT INTO inventory_stock (variant_id, branch_id, on_hand, reserved) VALUES ($1, $2, 3, 0)", [fixtureVariant, fixtureBranch]);
        }
        if (domain === "crm" && file.startsWith("003")) {
          await client.query("INSERT INTO crm_campaigns (created_by, request_key, segment_months, coupon_code, valid_until, target_count) VALUES ($1, 'migration-fixture', 1, 'LEGACY', NOW() + INTERVAL '1 year', 1)", [fixtureCreator]);
        }
        await client.query(readFileSync(`services/${domain}-service/migrations/${file}`, "utf8"));
        await client.query(`INSERT INTO ${ledger} (name) VALUES ($1)`, [file]);
      }
    });
  }
  await check("migrations preserve historical inventory and CRM campaigns", async () => {
    const stock = (await pools.inventory.query("SELECT on_hand, reserved, revision FROM inventory_stock WHERE variant_id = $1", [fixtureVariant])).rows[0];
    assert.equal(stock.on_hand, 3); assert.equal(stock.reserved, 0); assert.ok(Number(stock.revision) >= 1);
    await pools.crm.query("UPDATE crm_campaigns SET updated_at = NOW() WHERE request_key = 'migration-fixture'");
    assert.equal((await pools.crm.query("SELECT segment_months FROM crm_campaigns WHERE request_key = 'migration-fixture'")).rows[0].segment_months, 1);
  });
}

async function verify() {
  const gateway = "http://localhost:8005";
  const web = "http://localhost:3105";
  async function api(path, token, method = "GET", body, additional = {}) {
    const response = await fetch(gateway + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...additional }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
    return { status: response.status, body: await response.json().catch(() => null) };
  }
  const login = async (role) => { const result = await api("/auth/login", null, "POST", { email: `${role}@departamental.local`, password: env[`SEED_${role.toUpperCase()}_PASSWORD`] }); assert.equal(result.status, 200); return result.body; };
  const admin = await login("admin");
  const customer = await login("customer");
  const token = admin.accessToken;
  const { AnalyticsService } = load("analytics", "analytics/analytics.service");
  const analytics = new AnalyticsService(databases.analytics);
  const { PricingService } = load("pricing", "pricing/pricing.service");
  const pricing = new PricingService(databases.pricing, { enqueue: async () => {} }, { environment: "test", schedulerIntervalSeconds: 30 });
  // This database is isolated by its verified Compose label. Retire promotions
  // left by earlier test runs so the boundary fixture has no overlapping offer.
  await pools.pricing.query("UPDATE pricing_promotions SET status = 'EXPIRED' WHERE status <> 'EXPIRED'");
  const { CrmService } = load("crm", "crm/crm.service");
  const crm = new CrmService(databases.crm);
  const { InventoryService } = load("inventory", "inventory/inventory.service");
  const { InventoryOutboxService } = load("inventory", "events/outbox.service");
  const outbox = new InventoryOutboxService(databases.inventory, { environment: "test" });
  const inventory = new InventoryService(databases.inventory, outbox, { reservationTtlSeconds: 900 });
  const branchId = "b1000000-0000-4000-8000-000000000001";
  const variantId = "a2000000-0000-4000-8000-000000000001";

  await check("private snapshot requires service credential and is absent from Gateway", async () => {
    assert.equal((await fetch("http://localhost:3303/internal/inventory/snapshot")).status, 401);
    assert.equal((await api("/internal/inventory/snapshot", token)).status, 404);
    const response = await fetch("http://localhost:3303/internal/inventory/snapshot", { headers: { "x-internal-service-key": env.ANALYTICS_INVENTORY_SERVICE_KEY } });
    assert.equal(response.status, 200); const page = await response.json(); assert.equal(page.items.length, page.total); assert.ok(page.items.every((item) => item.revision >= 1));
  });
  async function reconciled() {
    const snapshot = await inventory.snapshot();
    const rows = (await pools.analytics.query("SELECT variant_id, branch_id, on_hand, reserved, available, revision FROM analytics_inventory_projection")).rows;
    if (rows.length !== snapshot.total) return false;
    return snapshot.items.every((item) => rows.some((row) => row.variant_id === item.variantId && row.branch_id === item.branch.id && row.on_hand === item.onHand && row.reserved === item.reserved && Number(row.revision) === item.revision));
  }
  await check("initial inventory reconciliation covers all authoritative stock", async () => {
    await until(reconciled);
    const report = await analytics.inventoryByBranch(); assert.equal(report.synchronization.complete, true);
    const snapshot = await inventory.snapshot(); assert.equal(report.synchronization.expectedRows, snapshot.total);
    return { rows: snapshot.total, units: snapshot.items.reduce((total, item) => total + item.onHand, 0) };
  });
  await check("branches without stock and sales keep their authoritative name", async () => {
    const emptyId = (await pools.inventory.query("INSERT INTO inventory_branches (id, name) VALUES ($1, 'Sucursal sin stock') ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id", [randomUUID()])).rows[0].id;
    await until(async () => (await analytics.inventoryByBranch()).branches.some((branch) => branch.branchId === emptyId && branch.available === 0 && branch.branchName === "Sucursal sin stock"));
    const sales = await analytics.salesByBranch(); assert.equal(sales.branches.find((branch) => branch.branchId === emptyId)?.sales, 0);
  });
  await check("duplicates, reversed revisions and legacy events cannot regress projection", async () => {
    const current = (await inventory.snapshot()).items.find((item) => item.variantId === fixtureVariant);
    const event = { eventId: randomUUID(), eventType: "inventory.stock.changed.v1", occurredAt: new Date().toISOString(), correlationId: null, variantId: current.variantId, branchId: current.branch.id, branchName: current.branch.name, onHand: 0, reserved: 0, available: 0, lastUpdatedAt: current.lastUpdatedAt, revision: current.revision + 10 };
    await analytics.project(event); await analytics.project(event);
    await analytics.importInventory([], [{ ...event, onHand: 3, available: 3, revision: current.revision }]);
    await analytics.project({ ...event, eventId: randomUUID(), revision: undefined, onHand: 9, available: 9, lastUpdatedAt: "2099-01-01T00:00:00Z" });
    assert.equal((await pools.analytics.query("SELECT on_hand FROM analytics_inventory_projection WHERE variant_id = $1", [fixtureVariant])).rows[0].on_hand, 0);
    // Restore authoritative state with a greater version; later reconciliation must converge.
    for (let count = 0; count < 11; count++) await pools.inventory.query("UPDATE inventory_stock SET on_hand = on_hand WHERE variant_id = $1", [fixtureVariant]);
    await until(reconciled);
  });
  await check("real PostgreSQL ranking sums two variants into one product", async () => {
    const productId = randomUUID(); const otherProduct = randomUUID();
    await analytics.project({ eventId: randomUUID(), eventType: "order.completed.v1", occurredAt: new Date().toISOString(), correlationId: null, orderId: randomUUID(), branchId, currency: "MXN", total: 210, items: [
      { productId, variantId: randomUUID(), productName: "Producto con variantes", quantity: 6, lineTotal: 60 },
      { productId, variantId: randomUUID(), productName: "Producto con variantes", quantity: 6, lineTotal: 60 },
      { productId: otherProduct, variantId: randomUUID(), productName: "Otro producto", quantity: 9, lineTotal: 90 },
    ] });
    const report = await analytics.topProducts("today", "20"); const rank = report.products.findIndex((item) => item.productId === productId); assert.ok(rank >= 0); assert.equal(report.products[rank].unitsSold, 12); assert.ok(rank < report.products.findIndex((item) => item.productId === otherProduct)); assert.equal(report.products.filter((item) => item.productId === productId).length, 1);
  });
  await check("Pricing applies midnight and expiration before its scheduler catches up", async () => {
    const start = "2026-10-09T06:00:00.000Z"; const end = "2026-10-09T07:00:00.000Z";
    const { promotion } = await pricing.createPromotion({ name: "Midnight boundary fixture", discountType: "PERCENTAGE", discountValue: 10, priority: 1000, startsAt: start, endsAt: end, timezone: "America/Mexico_City", targets: [{ scope: "VARIANT", targetId: fixtureVariant }] }, { id: admin.user.id, role: "ADMIN", correlationId: null });
    const query = { variantId: fixtureVariant, basePrice: 100, currency: "MXN" };
    assert.equal((await pricing.quote(query, new Date(Date.parse(start) - 1))).effectivePrice, 100);
    assert.equal((await pricing.quote(query, new Date(start))).effectivePrice, 90);
    assert.equal((await pricing.quote(query, new Date(end))).effectivePrice, 100);
    await pricing.reconcilePromotionStates(new Date(start));
    const restarted = new PricingService(databases.pricing, { enqueue: async () => {} }, { environment: "test", schedulerIntervalSeconds: 30 });
    await restarted.reconcilePromotionStates(new Date(start));
    await restarted.reconcilePromotionStates(new Date(end));
    assert.equal((await pricing.listPromotions()).promotions.find((item) => item.id === promotion.id).status, "EXPIRED");
  });
  await check("API rejects ambiguous promotion dates and unauthorized writes", async () => {
    const input = { name: "Invalid timezone fixture", discountType: "PERCENTAGE", discountValue: 10, startsAt: "2026-10-09T00:00:00", endsAt: "2026-10-10T00:00:00", timezone: "America/Mexico_City", targets: [{ scope: "ALL" }] };
    assert.equal((await api("/promotions", token, "POST", input)).status, 400);
    assert.equal((await api("/promotions", customer.accessToken, "POST", input)).status, 403);
    assert.equal((await api("/inventory", customer.accessToken)).status, 403);
    assert.equal((await fetch(web + "/api/promotions")).status, 401);
  });
  await check("administrative BFF creates and edits a promotion with cookie authentication", async () => {
    const input = { name: "Integration sale", discountType: "PERCENTAGE", discountValue: 10, priority: 999, startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), timezone: "America/Mexico_City", targets: [{ scope: "VARIANT", targetId: variantId }] };
    const headers = { Cookie: `departamental_access=${token}`, "Content-Type": "application/json" };
    const created = await fetch(web + "/api/promotions", { method: "POST", headers, body: JSON.stringify(input) });
    assert.equal(created.status, 201); const body = await created.json();
    const updated = await fetch(web + `/api/promotions/${body.promotion.id}`, { method: "PATCH", headers, body: JSON.stringify({ ...input, name: "Integration sale edited" }) }); assert.equal(updated.status, 200);
    const page = await fetch(web + "/promotions", { headers: { Cookie: headers.Cookie } }); assert.equal(page.status, 200); assert.match(await page.text(), /Integration sale edited/);
  });
  const catalog = await api("/products", token); assert.equal(catalog.status, 200);
  const product = catalog.body.items.find((item) => item.variants.some((variant) => variant.id === variantId)); assert.ok(product);
  const order = { branchId, channel: "PHYSICAL", customerId: customer.user.id, items: [{ productId: product.id, variantId, quantity: 1 }] };
  const socket = io(gateway, { path: "/realtime/socket.io", transports: ["websocket"], withCredentials: true, extraHeaders: { cookie: `departamental_access=${token}`, origin: web } }); sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); setTimeout(() => reject(new Error("Socket connection timeout")), 10000).unref(); });
  await check("only one of two simultaneous physical orders buys the last unit", async () => {
    await pools.inventory.query("UPDATE inventory_stock SET on_hand = 1, reserved = 0 WHERE variant_id = $1 AND branch_id = $2", [variantId, branchId]);
    let observed = null;
    const listener = (event) => { if (event.variantId === variantId && event.branchId === branchId && event.onHand === 0) observed = { event, receivedAt: Date.now() }; }; socket.on("stock.updated", listener);
    const started = Date.now();
    const responses = await Promise.all([api("/orders", token, "POST", order, { "Idempotency-Key": randomUUID() }), api("/orders", token, "POST", order, { "Idempotency-Key": randomUUID() })]);
    assert.equal(responses.filter((response) => response.status === 201).length, 1, JSON.stringify(responses.map((response) => ({ status: response.status, code: response.body?.code, message: response.body?.message }))));
    assert.ok(responses.find((response) => response.status !== 201)?.body?.code?.includes("STOCK"));
    const confirmed = responses.find((response) => response.status === 201).body.order;
    const quote = await api(`/pricing/quote?variantId=${variantId}&productId=${product.id}&basePrice=${product.variants.find((variant) => variant.id === variantId).listPrice}&currency=MXN`, token);
    assert.equal(quote.status, 200); assert.equal(confirmed.items[0].unitPrice, quote.body.effectivePrice);
    const stock = (await pools.inventory.query("SELECT on_hand, reserved FROM inventory_stock WHERE variant_id = $1 AND branch_id = $2", [variantId, branchId])).rows[0]; assert.equal(stock.on_hand, 0); assert.equal(stock.reserved, 0);
    await until(() => observed, 3000); socket.off("stock.updated", listener);
    const latency = observed.receivedAt - Date.parse(observed.event.occurredAt); assert.ok(latency <= 3000); assert.ok(observed.event.revision >= 1);
    return { realtimeMilliseconds: latency, saleToEventMilliseconds: observed.receivedAt - started };
  });
  await check("reservation expiry releases stock without another purchase", async () => {
    const result = await inventory.reserve({ variantId: fixtureVariant, branchId: fixtureBranch, orderId: randomUUID(), quantity: 1 }, randomUUID(), null);
    const id = result.reservation.id;
    await pools.inventory.query("UPDATE inventory_reservations SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [id]);
    await until(async () => (await pools.inventory.query("SELECT status FROM inventory_reservations WHERE id = $1", [id])).rows[0].status === "EXPIRED", 5000);
    const stock = (await pools.inventory.query("SELECT reserved FROM inventory_stock WHERE variant_id = $1", [fixtureVariant])).rows[0]; assert.equal(stock.reserved, 0);
    assert.ok((await pools.inventory.query("SELECT payload FROM inventory_outbox_events WHERE payload->>'variantId' = $1 AND payload->>'reserved' = '0'", [fixtureVariant])).rows.length > 0);
  });
  await check("a disconnected client reads the current version when it reconnects", async () => {
    socket.disconnect();
    await api("/inventory/movements", token, "POST", { variantId, branchId, type: "RECEIPT", quantity: 2 });
    socket.connect(); await until(() => socket.connected);
    const result = await api(`/inventory/branches/${branchId}`, token);
    assert.equal(result.body.items.find((item) => item.variantId === variantId).available, 2);
    const html = await (await fetch(web + "/dashboard", { headers: { Cookie: `departamental_access=${token}` } })).text(); assert.match(html, /http:\/\/localhost:8005/); assert.match(html, /Stock por sucursal/);
  });
  await check("campaign preview and confirmation recalculate recipients and deduplicate", async () => {
    const oldCustomer = randomUUID(); const returningCustomer = randomUUID();
    for (const id of [oldCustomer, returningCustomer]) await pools.crm.query("INSERT INTO crm_customers (customer_id, first_purchase_at, last_purchase_at, completed_orders, lifetime_total, currency) VALUES ($1, '2025-01-01', '2025-01-01', 1, 100, 'MXN')", [id]);
    const preview = await crm.inactiveSegment("3"); assert.ok(preview.customers.some((item) => item.customerId === returningCustomer)); assert.equal(preview.segment.includesNeverPurchased, false);
    await pools.crm.query("UPDATE crm_customers SET last_purchase_at = NOW() WHERE customer_id = $1", [returningCustomer]);
    const input = { months: 3, couponCode: "REGRESA" + randomUUID().slice(0,8).toUpperCase(),discountType:"PERCENTAGE",discountValue:10,targetScope:"ALL", validUntil: new Date(Date.now() + 86400000).toISOString() }; const key = randomUUID();
    const campaigns = await Promise.all([crm.createCampaign(input, admin.user.id, key, null), crm.createCampaign(input, admin.user.id, key, null)]); assert.equal(campaigns[0].campaign.id, campaigns[1].campaign.id);
    const recipients = (await pools.crm.query("SELECT customer_id FROM crm_campaign_recipients WHERE campaign_id = $1", [campaigns[0].campaign.id])).rows;
    assert.ok(recipients.some((item) => item.customer_id === oldCustomer)); assert.ok(!recipients.some((item) => item.customer_id === returningCustomer));
    const reference = (await pools.crm.query("SELECT reference_at, cutoff_at FROM crm_campaigns WHERE id = $1", [campaigns[0].campaign.id])).rows[0]; assert.ok(reference.reference_at && reference.cutoff_at);
    const { CampaignOutboxService } = load("crm", "crm/campaign-outbox.service"); const worker = new CampaignOutboxService(databases.crm, { environment: "test" });
    await pools.crm.query("UPDATE crm_customers SET last_purchase_at = NOW() WHERE customer_id = $1", [oldCustomer]);
    const pending = (await pools.crm.query("SELECT * FROM crm_campaign_outbox_events WHERE campaign_id = $1 AND customer_id = $2", [campaigns[0].campaign.id, oldCustomer])).rows[0];
    assert.equal(await worker.eligible(pending), false);
    assert.equal((await pools.crm.query("SELECT failure_code FROM crm_campaign_recipients WHERE campaign_id = $1 AND customer_id = $2", [campaigns[0].campaign.id, oldCustomer])).rows[0].failure_code, "NO_LONGER_ELIGIBLE");
  });
  await check("CRM APIs reject one- and two-month campaigns", async () => {
    for (const months of [1, 2]) { assert.equal((await api(`/segments/inactive?months=${months}`, token)).status, 400); assert.equal((await api("/campaigns", token, "POST", { months, couponCode: "INVALID", validUntil: new Date(Date.now() + 86400000).toISOString() })).status, 400); }
  });
  await check("final reconciliation still matches stock after sales and expiry", async () => { await until(reconciled); });
}

try {
  if (process.argv.includes("--prepare")) await prepare(); else await verify();
  writeFileSync(process.argv.includes("--prepare") ? "docs/verification-migrations.json" : "docs/verification-five-phases.json", JSON.stringify({ completedAt: new Date().toISOString(), project: env.COMPOSE_PROJECT_NAME, checks: results }, null, 2) + "\n");
  console.log(`${results.length} integration checks passed.`);
} catch (error) {
  // Never include connection strings or secrets in diagnostic output.
  console.error(error instanceof assert.AssertionError ? `Assertion failed: ${error.message}` : `Integration failed: ${error.code ?? error.message}`);
  process.exitCode = 1;
} finally { sockets.forEach((socket) => socket.disconnect()); await Promise.all(Object.values(pools).map((pool) => pool.end())); }
