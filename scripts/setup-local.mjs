import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = new URL("../", import.meta.url);
const envPath = new URL(".env", root);
const accounts = [
  ["ADMIN", "admin@departamental.local", "SEED_ADMIN_PASSWORD"],
  ["EMPLOYEE", "employee@departamental.local", "SEED_EMPLOYEE_PASSWORD"],
  ["CUSTOMER", "customer@departamental.local", "SEED_CUSTOMER_PASSWORD"],
];

function main() {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === "--credentials")) {
    throw new Error("Uso: node scripts/setup-local.mjs [--credentials]");
  }

  if (args[0] === "--credentials") {
    if (!existsSync(envPath)) {
      throw new Error("Primero ejecuta npm run setup:local para crear .env.");
    }
    const env = parseEnv(readFileSync(envPath, "utf8"));
    if (accounts.some(([, , key]) => !env[key] || env[key].length < 12 || env[key].startsWith("replace_with_"))) {
      throw new Error("Configura las tres variables SEED_*_PASSWORD en .env con al menos 12 caracteres.");
    }
    console.log("Cuentas semilla de .env. Una cuenta existente conserva su contraseña original.");
    console.table(accounts.map(([role, email, key]) => ({ rol: role, correo: email, contraseña: env[key] })));
    return;
  }

  if (existsSync(envPath)) {
    console.log("Se conservó el archivo .env existente sin modificarlo. Consulta .env.example para completar variables pendientes.");
    return;
  }

  const template = readFileSync(new URL(".env.example", root), "utf8");
  const secretNames = Object.keys(parseEnv(template)).filter((name) =>
    name === "JWT_ACCESS_SECRET" || name === "ONBOARDING_EMAIL_KEY" ||
    name === "TRUSTED_BFF_IP_KEY" || name.endsWith("_DB_PASSWORD") ||
    name === "RABBITMQ_PASSWORD" || name.endsWith("_SERVICE_KEY") ||
    name.endsWith("_REPORT_KEY") || name.endsWith("_DIRECTORY_KEY") ||
    /^SEED_.*_PASSWORD$/.test(name),
  );
  const values = new Map(secretNames.map((name) => [name, randomBytes(32).toString("base64url")]));
  const content = template.replace(/^([A-Z][A-Z0-9_]*)=.*$/gm, (line, name) =>
    values.has(name) ? `${name}=${values.get(name)}` : line,
  );
  writeFileSync(envPath, content, { flag: "wx", mode: 0o600 });
  console.log(`Configuración local creada en ${fileURLToPath(envPath)}. No se imprimieron secretos.`);
  console.log("Consulta tus cuentas con npm run credentials:local y continúa con Docker Compose según README.md.");
}

try {
  main();
} catch (error) {
  // Filesystem errors may contain local paths; never print configuration values.
  console.error(error instanceof Error && !error.code ? error.message : "No se pudo leer o crear la configuración local.");
  process.exitCode = 1;
}
