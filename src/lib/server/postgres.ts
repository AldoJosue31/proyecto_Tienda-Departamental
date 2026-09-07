import { Pool } from "pg";

declare global {
  var departmentPostgresPool: Pool | undefined;
}

export function postgresPersistenceEnabled() {
  return process.env.USE_POSTGRES_PERSISTENCE === "true" && Boolean(process.env.DATABASE_URL);
}

export function getPostgresPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está configurada.");
  if (!globalThis.departmentPostgresPool) {
    globalThis.departmentPostgresPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return globalThis.departmentPostgresPool;
}
