import { Pool } from "pg";

import { PasswordService } from "../auth/password.service";
import "../config/load-env";
import { loadDatabaseConfig, type Role } from "../config/environment";

interface SeedUser {
  email: string;
  name: string;
  role: Role;
  password: string;
}

function configuredPassword(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function seedUsers(): SeedUser[] {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed users are disabled in production.");
  }

  return [
    {
      email: "admin@departamental.local",
      name: "Administrador local",
      role: "ADMIN",
      password: configuredPassword("SEED_ADMIN_PASSWORD", "AdminLocal!2026"),
    },
    {
      email: "employee@departamental.local",
      name: "Empleado local",
      role: "EMPLOYEE",
      password: configuredPassword("SEED_EMPLOYEE_PASSWORD", "EmployeeLocal!2026"),
    },
    {
      email: "customer@departamental.local",
      name: "Cliente local",
      role: "CUSTOMER",
      password: configuredPassword("SEED_CUSTOMER_PASSWORD", "CustomerLocal!2026"),
    },
  ];
}

async function run(): Promise<void> {
  const config = loadDatabaseConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: true } : undefined,
  });
  const passwordService = new PasswordService();

  try {
    for (const user of seedUsers()) {
      const passwordHash = await passwordService.hash(user.password);
      await pool.query(
        `
          INSERT INTO auth_users (email, name, password_hash, role)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT ((lower(email))) DO NOTHING
        `,
        [user.email, user.name, passwordHash, user.role],
      );
    }
  } finally {
    await pool.end();
  }
}

run()
  .then(() => process.stdout.write("Local auth seed completed.\n"))
  .catch(() => {
    // Passwords and hashes must never reach logs, even when seeding fails.
    process.stderr.write("Auth seed failed.\n");
    process.exitCode = 1;
  });
