import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Pool } from "pg";

import "../config/load-env";
import { loadDatabaseConfig } from "../config/environment";

async function migrationDirectory(): Promise<string> {
  const candidates = [
    resolve(process.cwd(), "migrations"),
    resolve(__dirname, "../../migrations"),
  ];

  for (const candidate of candidates) {
    try {
      await readdir(candidate);
      return candidate;
    } catch {
      // Try the next candidate; source and compiled layouts differ.
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const directory = await migrationDirectory();
    const files = (await readdir(directory))
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();
    const appliedResult = await client.query<{ name: string }>(
      "SELECT name FROM auth_schema_migrations",
    );
    const applied = new Set(appliedResult.rows.map((row) => row.name));

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const sql = await readFile(resolve(directory, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO auth_schema_migrations (name) VALUES ($1)",
          [file],
        );
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
  // Connection strings and SQL details must not be emitted from this process.
  process.stderr.write("Auth database migration failed.\n");
  process.exitCode = 1;
});
