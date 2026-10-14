import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const docker = (args, input) => execFileSync("docker", args, { input, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
const digest = value => createHash("sha256").update(value).digest("hex");
const phaseRange = process.argv.includes("--phases-7-9") ? "7-9" : process.argv.includes("--phases-4-6") ? "4-6" : "1-3";
const reportPath = phaseRange === "1-3" ? "docs/verification-release-images.json" : `docs/verification-release-images-fases-${phaseRange}.json`;
const release = JSON.parse(readFileSync(`docs/release-fases-${phaseRange}.json`, "utf8"));
const owners = { auth: "servicio-autenticacion", catalog: "servicio-catalogo", inventory: "servicio-inventario", pricing: "servicio-precios", orders: "servicio-pedidos", analytics: "servicio-analitica", logistics: "servicio-logistica", crm: "servicio-clientes", notification: "servicio-notificaciones" };
const checks = []; let temporary;
try {
  for (const project of ["web", "departamental-five-phases"]) {
    const baseline = JSON.parse(readFileSync(`docs/verification-release-${project}.json`, "utf8"));
    if (!baseline.passed) throw new Error("Verified checkpoint required");
    temporary = "release-images-" + randomUUID().slice(0, 12);
    const pgImage = release.images.find(image => image.service === "auth-postgres").imageId;
    docker(["run", "-d", "--name", temporary, "--label", "departamental.image-rehearsal=true", "--network", "none", "--tmpfs", "/var/lib/postgresql/data:rw,size=512m", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", pgImage]);
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { docker(["exec", temporary, "pg_isready", "-U", "postgres"]); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 300)); }
    }
    if (!ready) throw new Error("Temporary database not ready");
    const sql = (database, statement) => docker(["exec", "-i", temporary, "psql", "-U", "postgres", "-d", database, "-At", "-v", "ON_ERROR_STOP=1"], statement).toString().trim();
    for (const item of baseline.databases.filter(item => item.domain !== "legacy")) {
      const dump = readFileSync(path.join(baseline.backupDirectory, `${item.domain}.dump`));
      if (digest(dump) !== item.sha256) throw new Error("Checkpoint checksum mismatch");
      docker(["exec", temporary, "createdb", "-U", "postgres", item.database]);
      docker(["exec", "-i", temporary, "pg_restore", "--exit-on-error", "--no-owner", "--no-privileges", "-U", "postgres", "-d", item.database], dump);
      const tables = sql(item.database, "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '%schema_migrations' ORDER BY tablename;").split("\n").filter(Boolean);
      const before = tables.map(table => {
        if (!/^[a-z0-9_]+$/.test(table)) throw new Error("Unexpected table identifier");
        const exclude = item.domain === "auth" && table === "auth_users" ? " AND column_name <> 'updated_at'" : "";
        const columns = sql(item.database, `SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}'${exclude};`);
        const statement = `SELECT COALESCE(jsonb_agg(row ORDER BY row::text),'[]'::jsonb) FROM (SELECT ${columns} FROM "${table}") row;`;
        return { statement, hash: digest(sql(item.database, statement)) };
      });
      const image = release.images.find(image => image.service === owners[item.domain]);
      const migrate = () => docker(["run", "--rm", "--read-only", "--network", `container:${temporary}`, "--entrypoint", "node", "-e", `DATABASE_URL=postgresql://postgres@127.0.0.1:5432/${item.database}`, "-e", "DATABASE_SSL=false", image.imageId, "dist/database/migrate.js"]);
      migrate();
      const ledgerSql = `SELECT jsonb_agg(m ORDER BY name) FROM ${item.domain}_schema_migrations m;`;
      const ledger = digest(sql(item.database, ledgerSql)); migrate();
      if (ledger !== digest(sql(item.database, ledgerSql)) || before.some(table => table.hash !== digest(sql(item.database, table.statement)))) throw new Error("Image migration changed existing data or duplicated its ledger");
      checks.push({ project, domain: item.domain, imageId: image.imageId, preexistingTablesPreserved: tables.length, repeatedImageMigrationPassed: true, passed: true });
      console.log(`PASS ${project} restored ${item.domain} with candidate image`);
    }
    docker(["rm", "-f", temporary]); temporary = undefined;
  }
} catch {
  console.error("IMAGE_REHEARSAL_FAILED; original checkpoints and live databases are intact."); process.exitCode = 1;
} finally {
  if (temporary) {
    const state = JSON.parse(docker(["inspect", temporary]).toString())[0];
    if (state.Config.Labels["departamental.image-rehearsal"] === "true" && state.HostConfig.NetworkMode === "none") docker(["rm", "-f", temporary]);
  }
  writeFileSync(reportPath, JSON.stringify({ completedAt: new Date().toISOString(), releaseId: release.releaseId, passed: checks.length === 18 && process.exitCode !== 1, liveDatabasesModified: false, checks }, null, 2) + "\n");
}
