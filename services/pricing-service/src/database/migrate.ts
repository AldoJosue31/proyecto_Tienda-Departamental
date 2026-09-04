import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

import "../config/load-env";
import { loadDatabaseConfig } from "../config/environment";

async function directory(): Promise<string> {
  for (const candidate of [resolve(process.cwd(), "migrations"), resolve(__dirname, "../../migrations")]) {
    try {
      await readdir(candidate);
      return candidate;
    } catch {
      // Source and compiled layouts differ.
    }
  }
  throw new Error("Migration directory could not be located.");
}

async function run(): Promise<void> {
  const config = loadDatabaseConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: true } : undefined,
  });
  const client = await pool.connect();
  try {
    await client.query("CREATE TABLE IF NOT EXISTS pricing_schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    const files = (await readdir(await directory())).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
    const applied = new Set((await client.query<{ name: string }>("SELECT name FROM pricing_schema_migrations")).rows.map((row) => row.name));
    for (const file of files) {
      if (applied.has(file)) continue;
      await client.query("BEGIN");
      try {
        await client.query(await readFile(resolve(await directory(), file), "utf8"));
        await client.query("INSERT INTO pricing_schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(() => {
  process.stderr.write("Pricing database migration failed.\n");
  process.exitCode = 1;
});
