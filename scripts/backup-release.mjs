import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// Quiesced, private backup + restoration/migration rehearsal. Never migrate
// live databases, remove live volumes, or print credentials/private rows.
const at = process.argv.indexOf("--project");
const project = at < 0 ? "web" : process.argv[at + 1];
if (!["web", "departamental-five-phases"].includes(project)) throw new Error("Unsupported project");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const directory = path.resolve("../.codex-backups/integral-release", stamp);
mkdirSync(directory, { recursive: true });
const hash = value => createHash("sha256").update(value).digest("hex");
const docker = (args, input) => execFileSync("docker", args, { input, timeout: 60000, maxBuffer: 256 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
const inspect = name => JSON.parse(docker(["inspect", name]).toString())[0];
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const domains = ["auth", "catalog", "inventory", "pricing", "orders", "analytics", "logistics", "crm", "notification"];
const manifest = { project, startedAt: new Date().toISOString(), completedAt: null, passed: false, liveDatabasesMigrated: false, images: [], databases: [], volumes: [], checks: [] };
const stopped = [], temporary = [];
const auxiliaryStarted = [];
const pendingFixtures = process.argv.includes("--pending-fixtures");
const hold = process.argv.includes("--hold");
if (hold && project !== "web") throw new Error("Holding writers is only supported for the coordinated principal deployment");
if (pendingFixtures && project !== "departamental-five-phases") throw new Error("Pending fixtures are only permitted in the isolated project");
let fixture, probeChannel, probeConnection;
const liveSql = (domain, statement) => docker(["exec", "-i", `${project}-${domain}-postgres-1`, "psql", "-U", `${domain}_service`, "-d", `${domain}_service`, "-At", "-v", "ON_ERROR_STOP=1"], statement).toString().trim();
const ids = docker(["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`]).toString().trim().split(/\s+/).filter(Boolean);
const states = ids.map(inspect);
if (!states.length) throw new Error("Project has no containers");
for (const state of states) {
  if (state.Config.Labels["com.docker.compose.project"] !== project) throw new Error("Isolation mismatch");
  manifest.images.push({ service: state.Config.Labels["com.docker.compose.service"], imageId: state.Image, createdAt: state.Created });
}
const envFile = project === "web" ? ".env" : ".env.integration";
if (existsSync(envFile)) writeFileSync(path.join(directory, "environment.private"), readFileSync(envFile), { mode: 0o600 });
const check = (name, detail = {}) => { manifest.checks.push({ name, passed: true, ...detail }); console.log("PASS " + name); };
let rehearsal;
const sql = (db, statement) => docker(["exec", "-i", rehearsal, "psql", "-U", "postgres", "-d", db, "-At", "-v", "ON_ERROR_STOP=1"], statement).toString().trim();
const tableFingerprint = (db, table, columns = "*") => hash(sql(db, `SELECT COALESCE(jsonb_agg(row ORDER BY row::text), '[]'::jsonb) FROM (SELECT ${columns} FROM "${table}") row;`));
async function ready(name, args) {
  for (let attempt = 0; attempt < 90; attempt++) { try { docker(["exec", name, ...args]); return; } catch { await sleep(500); } }
  throw new Error("Temporary service did not become ready");
}
try {
  // Stop writers first; shutting down workers also returns unacked broker jobs.
  const writers = states.filter(s => s.State.Running && !/postgres$|redis$|^rabbitmq$|^smtp-capture$/.test(s.Config.Labels["com.docker.compose.service"]));
  if (writers.length) { docker(["stop", "--time", "30", ...writers.map(s => s.Id)]); stopped.push(...writers.map(s => s.Id)); }
  if (pendingFixtures) {
    const [stockId, variantId, branchId, reserved] = liveSql("inventory", "SELECT id,variant_id,branch_id,reserved FROM inventory_stock WHERE on_hand-reserved>0 ORDER BY id LIMIT 1;").split("|");
    if (!stockId) throw new Error("A positive test stock row is required");
    fixture = { stockId, variantId, branchId, originalReserved: Number(reserved), orderId: randomUUID(), reservationId: randomUUID(), deliveryId: randomUUID(), eventId: randomUUID(), actorId: randomUUID(), campaignId: randomUUID(), queue: "release.restore-probe." + randomUUID() };
    liveSql("orders", `INSERT INTO orders(id,customer_id,created_by,created_by_role,branch_id,channel) VALUES('${fixture.orderId}','${fixture.actorId}','${fixture.actorId}','ADMIN','${branchId}','ONLINE'); INSERT INTO orders_outbox_events(id,event_type,payload) VALUES('${fixture.eventId}','order.created.v1','${JSON.stringify({ orderId: fixture.orderId, customerId: fixture.actorId, branchId, channel: "ONLINE", status: "PENDING", currency: "MXN", total: 0, items: [], rehearsal: true })}'::jsonb);`);
    liveSql("inventory", `BEGIN; UPDATE inventory_stock SET reserved=reserved+1,revision=revision+1 WHERE id='${stockId}'; INSERT INTO inventory_reservations(id,stock_id,variant_id,branch_id,order_id,actor,idempotency_key,quantity,expires_at) VALUES('${fixture.reservationId}','${stockId}','${variantId}','${branchId}','${fixture.orderId}','release-rehearsal','${fixture.reservationId}',1,NOW()+INTERVAL '1 hour'); COMMIT;`);
    liveSql("notification", `INSERT INTO notification_deliveries(id,campaign_id,customer_id,coupon_code,coupon_valid_until,status) VALUES('${fixture.deliveryId}','${fixture.campaignId}','${fixture.actorId}','RELEASEPROBE',NOW()+INTERVAL '1 hour','PENDING');`);
    const env = Object.fromEntries(readFileSync(envFile, "utf8").split(/\r?\n/).map(line => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
    const { connect } = createRequire(new URL("../services/pricing-service/package.json", import.meta.url))("amqplib");
    probeConnection = await connect(`amqp://departamental:${env.RABBITMQ_PASSWORD}@127.0.0.1:55672`);
    probeChannel = await probeConnection.createConfirmChannel();
    await probeChannel.assertQueue(fixture.queue, { durable: true });
    for (const [kind, referenceId] of [["sale", fixture.orderId], ["reservation", fixture.reservationId], ["email", fixture.deliveryId]]) probeChannel.sendToQueue(fixture.queue, Buffer.from(JSON.stringify({ kind, referenceId })), { persistent: true, messageId: referenceId });
    await probeChannel.waitForConfirms(); await probeConnection.close(); probeConnection = null; probeChannel = null;
    manifest.pendingFixture = fixture;
    check("isolated pending sale, reservation, email and durable jobs prepared");
  }
  const broker = states.find(s => s.Config.Labels["com.docker.compose.service"] === "rabbitmq");
  if (!broker?.State.Running) throw new Error("Broker must be running to capture its checkpoint");
  const queues = JSON.parse(docker(["exec", broker.Id, "rabbitmqctl", "list_queues", "--formatter", "json", "name", "messages", "messages_ready", "messages_unacknowledged"]).toString());
  if (queues.some(q => q.messages_unacknowledged !== 0)) throw new Error("Broker still has in-flight jobs");
  manifest.brokerCheckpoint = queues;
  docker(["stop", "--time", "30", broker.Id]); stopped.push(broker.Id);
  check("all application writers stopped and broker has no unacknowledged jobs", { queues: queues.length, pendingMessages: queues.reduce((n, q) => n + q.messages, 0) });
  for (const domain of [...domains, "legacy"]) {
    const service = domain === "legacy" ? "postgres" : `${domain}-postgres`;
    const state = states.find(s => s.Config.Labels["com.docker.compose.service"] === service);
    if (!state) { if (domain === "legacy") continue; throw new Error("Missing database"); }
    if (!state.State.Running) {
      if (domain !== "legacy") throw new Error("Database must be running for backup");
      docker(["start", state.Id]); auxiliaryStarted.push(state.Id);
      await ready(state.Id, ["pg_isready", "-U", "departamental"]);
    }
    const env = Object.fromEntries(state.Config.Env.map(v => { const i = v.indexOf("="); return [v.slice(0, i), v.slice(i + 1)]; }));
    const dump = docker(["exec", state.Id, "pg_dump", "--no-password", "-U", env.POSTGRES_USER, "-d", env.POSTGRES_DB, "--format=custom"]);
    if (dump.length < 100) throw new Error("Empty backup");
    writeFileSync(path.join(directory, `${domain}.dump`), dump, { mode: 0o600 });
    manifest.databases.push({ domain, database: env.POSTGRES_DB, bytes: dump.length, sha256: hash(dump) });
  }
  const brokerVolume = broker.Mounts.find(m => m.Type === "volume" && m.Destination === "/var/lib/rabbitmq");
  if (!brokerVolume) throw new Error("Broker storage is not a named volume");
  const archive = docker(["run", "--rm", "--network", "none", "--entrypoint", "tar", "--mount", `type=volume,source=${brokerVolume.Name},target=/source,readonly`, "postgres:16-alpine", "-czf", "-", "-C", "/source", "."]);
  writeFileSync(path.join(directory, "rabbitmq.tar.gz"), archive, { mode: 0o600 });
  manifest.volumes.push({ service: "rabbitmq", bytes: archive.length, sha256: hash(archive), hostname: broker.Config.Hostname, imageId: broker.Image });
  check("all domain databases and consistent durable RabbitMQ storage backed up", { databases: manifest.databases.length });
  rehearsal = "integral-restore-" + randomUUID().slice(0, 8); temporary.push(rehearsal);
  docker(["run", "-d", "--name", rehearsal, "--label", "codex.integral-rehearsal=true", "--network", "none", "--tmpfs", "/var/lib/postgresql/data", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16-alpine"]);
  await ready(rehearsal, ["pg_isready", "-U", "postgres"]);
  for (const item of manifest.databases) {
    docker(["exec", rehearsal, "createdb", "-U", "postgres", item.database]);
    docker(["exec", "-i", rehearsal, "pg_restore", "--exit-on-error", "--no-owner", "--no-privileges", "-U", "postgres", "-d", item.database], readFileSync(path.join(directory, `${item.domain}.dump`)));
    const tables = sql(item.database, "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '%schema_migrations' ORDER BY tablename;").split("\n").filter(Boolean);
    const before = new Map(tables.map(table => {
      // Auth's onboarding backfill deliberately fires its updated_at trigger.
      // Identity data, created_at, hashes/roles and complete session rows remain exact.
      const exclude = item.domain === "auth" && table === "auth_users" ? " AND column_name <> 'updated_at'" : "";
      const columns = sql(item.database, `SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}'${exclude};`);
      return [table, { columns, hash: tableFingerprint(item.database, table, columns) }];
    }));
    if (item.domain !== "legacy") {
      const ledger = `${item.domain}_schema_migrations`;
      sql(item.database, `CREATE TABLE IF NOT EXISTS ${ledger}(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
      const apply = () => {
        const applied = new Set(sql(item.database, `SELECT name FROM ${ledger};`).split("\n"));
        for (const file of readdirSync(`services/${item.domain}-service/migrations`).filter(f => /^\d+_.+\.sql$/.test(f)).sort()) {
          if (applied.has(file)) continue;
          sql(item.database, `BEGIN;\n${readFileSync(`services/${item.domain}-service/migrations/${file}`, "utf8")}\nINSERT INTO ${ledger}(name) VALUES('${file}');\nCOMMIT;`);
        }
      };
      apply(); const first = hash(sql(item.database, `SELECT jsonb_agg(m ORDER BY name) FROM ${ledger} m;`)); apply();
      if (first !== hash(sql(item.database, `SELECT jsonb_agg(m ORDER BY name) FROM ${ledger} m;`))) throw new Error("Migration replay is not idempotent");
    }
    for (const [table, baseline] of before) if (baseline.hash !== tableFingerprint(item.database, table, baseline.columns)) throw new Error(`Migration changed preexisting data: ${item.domain}.${table}`);
    item.tablesPreserved = tables.length;
    check(`${item.domain} restoration and repeated migrations preserve preexisting columns/rows`, { tables: tables.length });
  }
  if (fixture) {
    if (sql("orders_service", `SELECT COUNT(*) FROM orders WHERE id='${fixture.orderId}' AND status='PENDING';`) !== "1" || sql("orders_service", `SELECT COUNT(*) FROM orders_outbox_events WHERE id='${fixture.eventId}' AND published_at IS NULL;`) !== "1") throw new Error("Pending sale/outbox was not restored exactly once");
    if (sql("inventory_service", `SELECT COUNT(*) FROM inventory_reservations WHERE id='${fixture.reservationId}' AND status='RESERVED';`) !== "1" || Number(sql("inventory_service", `SELECT reserved FROM inventory_stock WHERE id='${fixture.stockId}';`)) !== fixture.originalReserved + 1) throw new Error("Pending reservation changed during restore");
    if (sql("notification_service", `SELECT COUNT(*) FROM notification_deliveries WHERE id='${fixture.deliveryId}' AND status='PENDING' AND attempts=0;`) !== "1") throw new Error("Pending email was lost or sent in restore");
    check("pending sale, reservation and email restored once without consumption or sending");
  }
  const brokerCopy = "integral-broker-" + randomUUID().slice(0, 8); temporary.push(brokerCopy);
  manifest.stage = "broker-storage-owner";
  const owner = docker(["run", "--rm", "--network", "none", "--entrypoint", "sh", broker.Image, "-c", "printf '%s:%s' \"$(id -u rabbitmq)\" \"$(id -g rabbitmq)\""]).toString().trim().split(":");
  if (!owner.every(value => /^\d+$/.test(value))) throw new Error("Invalid broker storage owner");
  manifest.stage = "broker-create";
  docker(["run", "-d", "--name", brokerCopy, "--hostname", broker.Config.Hostname, "--add-host", `${broker.Config.Hostname}:127.0.0.1`, "--label", "codex.integral-rehearsal=true", "--network", "none", "--tmpfs", `/var/lib/rabbitmq:uid=${owner[0]},gid=${owner[1]}`, "--entrypoint", "sh", broker.Image, "-c", "sleep infinity"]);
  manifest.stage = "broker-extract";
  docker(["exec", "-i", brokerCopy, "tar", "-xzf", "-", "-C", "/var/lib/rabbitmq"], archive);
  manifest.stage = "broker-start";
  docker(["exec", "-d", "--user", "rabbitmq", "-e", "HOME=/var/lib/rabbitmq", brokerCopy, "rabbitmq-server"]);
  manifest.stage = "broker-ready";
  await ready(brokerCopy, ["env", "HOME=/var/lib/rabbitmq", "rabbitmq-diagnostics", "-q", "--timeout", "3", "check_running"]);
  manifest.stage = "broker-checkpoint";
  const restoredQueues = JSON.parse(docker(["exec", "-e", "HOME=/var/lib/rabbitmq", brokerCopy, "rabbitmqctl", "list_queues", "--formatter", "json", "name", "messages"]).toString());
  for (const queue of queues) if (!restoredQueues.some(q => q.name === queue.name && q.messages === queue.messages)) throw new Error("Broker restoration changed pending jobs");
  check("durable broker restoration preserves queues and pending message counts", { pendingMessages: queues.reduce((n, q) => n + q.messages, 0) });
  manifest.passed = true;
} catch (error) {
  manifest.failure = error instanceof Error && !("status" in error) ? error.message : "COMMAND_FAILED";
  writeFileSync(path.join(directory, "failure.private.txt"), String(error instanceof Error && "stderr" in error ? error.stderr : error), { mode: 0o600 });
  if (error instanceof Error && error.message.startsWith("Migration changed preexisting data:")) console.error(error.message);
  process.exitCode = 1; console.error("Integral backup/rehearsal failed; private backups retained, live databases not migrated.");
} finally {
  for (const name of temporary.reverse()) {
    try { const state = inspect(name); if (state.Config.Labels["codex.integral-rehearsal"] !== "true" || state.HostConfig.NetworkMode !== "none") throw new Error("Cleanup guard failed"); docker(["rm", "-f", name]); } catch { process.exitCode = 1; }
  }
  if (fixture) {
    try {
      liveSql("inventory", `BEGIN; UPDATE inventory_stock SET reserved=reserved-1,revision=revision+1 WHERE id='${fixture.stockId}' AND EXISTS(SELECT 1 FROM inventory_reservations WHERE id='${fixture.reservationId}' AND status='RESERVED'); UPDATE inventory_reservations SET status='RELEASED',released_at=NOW() WHERE id='${fixture.reservationId}' AND status='RESERVED'; COMMIT;`);
      liveSql("orders", `UPDATE orders SET status='CANCELLED',cancellation_reason='Release rehearsal completed',cancelled_at=NOW() WHERE id='${fixture.orderId}'; UPDATE orders_outbox_events SET published_at=NOW() WHERE id='${fixture.eventId}';`);
      liveSql("notification", `UPDATE notification_deliveries SET status='UNDELIVERABLE',failure_code='REHEARSAL_COMPLETED' WHERE id='${fixture.deliveryId}' AND status='PENDING';`);
    } catch { process.exitCode = 1; }
  }
  // Restore exactly the services that were running; broker before its clients.
  manifest.writersHeldForDeployment = hold && manifest.passed && process.exitCode !== 1;
  manifest.heldContainers = manifest.writersHeldForDeployment ? stopped : [];
  const restore = manifest.writersHeldForDeployment ? [] : stopped.slice().reverse();
  for (const id of restore) { try { docker(["start", id]); } catch { process.exitCode = 1; } }
  for (const id of auxiliaryStarted) try { docker(["stop", id]); } catch { process.exitCode = 1; }
  if (fixture) {
    try {
      const env = Object.fromEntries(readFileSync(envFile, "utf8").split(/\r?\n/).map(line => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
      const { connect } = createRequire(new URL("../services/pricing-service/package.json", import.meta.url))("amqplib");
      await ready(`${project}-rabbitmq-1`, ["rabbitmq-diagnostics", "-q", "--timeout", "3", "check_running"]);
      probeConnection = await connect(`amqp://departamental:${env.RABBITMQ_PASSWORD}@127.0.0.1:55672`); probeChannel = await probeConnection.createChannel();
      await probeChannel.deleteQueue(fixture.queue); await probeConnection.close();
    } catch { process.exitCode = 1; }
  }
  manifest.completedAt = new Date().toISOString(); manifest.passed &&= process.exitCode !== 1;
  writeFileSync(path.join(directory, "manifest.private.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  const report = { ...manifest, backupDirectory: directory, brokerCheckpoint: manifest.brokerCheckpoint?.map(({ name, messages }) => ({ name, messages })), privacy: { secretsExcluded: true, privateBackupsOutsideGit: true } };
  writeFileSync(`docs/verification-release-${project}.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(`Backup/rehearsal ${manifest.passed ? "passed" : "incomplete"}; ${manifest.databases.length} databases. ${manifest.writersHeldForDeployment ? "Writers and broker held for deployment." : "Services restored."} Private backup: ${directory}`);
}
