import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const sql = (domain, statement) => JSON.parse(execFileSync("docker", ["exec", `web-${domain}-postgres-1`, "psql", "-U", `${domain}_service`, "-d", `${domain}_service`, "-At", "-c", statement], { encoding: "utf8" }).trim());
const inventory = sql("inventory", "SELECT json_agg(s ORDER BY id) FROM (SELECT id,variant_id,branch_id,on_hand,reserved,reorder_point FROM inventory_stock) s");
const before = JSON.parse(readFileSync(process.argv[2], "utf8").replace(/^\uFEFF/, ""));
assert.deepEqual(inventory, before, "Stock quantities changed during deployment");
const projected = sql("analytics", "SELECT json_agg(s ORDER BY variant_id,branch_id) FROM (SELECT variant_id,branch_id,on_hand,reserved,available,revision FROM analytics_inventory_projection) s");
const versions = sql("inventory", "SELECT json_agg(s ORDER BY variant_id,branch_id) FROM (SELECT variant_id,branch_id,on_hand,reserved,on_hand-reserved AS available,revision FROM inventory_stock) s");
assert.deepEqual(projected, versions, "Analytics does not cover authoritative inventory");
const sync = sql("analytics", "SELECT row_to_json(s) FROM (SELECT completed_at,imported_rows,expected_rows,last_error FROM analytics_inventory_sync WHERE id = TRUE) s");
assert.ok(sync.completed_at); assert.equal(sync.last_error, null); assert.equal(sync.expected_rows, inventory.length);
const containers = execFileSync("docker", ["compose", "ps", "--format", "json"], { encoding: "utf8" }).trim().split(/\r?\n/).map((line) => JSON.parse(line));
assert.equal(containers.length, 25); assert.ok(containers.every((container) => container.State === "running" && (container.Health === "healthy" || container.Service === "aplicacion-web")));
assert.equal((await fetch("http://localhost:3005/login")).status, 200);
const report = { completedAt: new Date().toISOString(), project: "web", healthyContainers: containers.length, stockUnchanged: true, inventoryRows: inventory.length, inventoryUnits: inventory.reduce((total, row) => total + row.on_hand, 0), analyticsRows: projected.length, analyticsUnits: projected.reduce((total, row) => total + row.on_hand, 0), versionsMatch: true, synchronization: sync };
writeFileSync("docs/verification-local-five-phases.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
