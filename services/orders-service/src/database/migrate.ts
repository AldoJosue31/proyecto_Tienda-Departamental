import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Pool } from "pg";

import "../config/load-env";
import { loadDatabaseConfig } from "../config/environment";

async function migrationDirectory(): Promise<string> {
  const candidates = [resolve(process.cwd(), "migrations"), resolve(__dirname, "../../migrations")];
  for (const candidate of candidates) {
    try {
      await readdir(candidate);
      return candidate;
    } catch {
      // Compiled and source layouts use different relative directories.
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
    await client.query(
      "CREATE TABLE IF NOT EXISTS orders_schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );
    const directory = await migrationDirectory();
    const files = (await readdir(directory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
    const applied = await client.query<{ name: string }>("SELECT name FROM orders_schema_migrations");
    const known = new Set(applied.rows.map((row) => row.name));
    for (const file of files) {
      if (known.has(file)) continue;
      await client.query("BEGIN");
      try {
        await client.query(await readFile(resolve(directory, file), "utf8"));
        await client.query("INSERT INTO orders_schema_migrations (name) VALUES ($1)", [file]);
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
  process.stderr.write("Orders database migration failed.\n");
  process.exitCode = 1;
});
