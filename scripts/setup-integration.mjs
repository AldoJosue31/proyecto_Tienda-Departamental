import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync, readFileSync, appendFileSync } from "node:fs";

if (existsSync(".env.integration")) {
  const existing = readFileSync(".env.integration", "utf8");
  const names = new Set([...existing.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]));
  const upgrades = {
    APP_PUBLIC_ORIGIN: "http://localhost:3105",
    ONBOARDING_EMAIL_KEY: randomBytes(32).toString("base64url"),
    AUTH_STATUS_INTERNAL_SERVICE_KEY: randomBytes(32).toString("base64url"),
    AUTH_ONBOARDING_INTERNAL_SERVICE_KEY: randomBytes(32).toString("base64url"),
    TRUSTED_BFF_IP_KEY: randomBytes(32).toString("base64url"),
  };
  const missing = Object.entries(upgrades).filter(([key]) => !names.has(key));
  if (missing.length) appendFileSync(".env.integration", "\n" + missing.map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
  console.log("Existing isolated integration configuration retained; missing account configuration added without printing secrets.");
} else {
  const secret = () => randomBytes(32).toString("base64url");
  const values = {
    COMPOSE_PROJECT_NAME: "departamental-five-phases", WEB_HOST_PORT: "3105",
    PUBLIC_GATEWAY_URL: "http://localhost:8005", CORS_ALLOWED_ORIGIN: "http://localhost:3105",
    APP_PUBLIC_ORIGIN: "http://localhost:3105", ONBOARDING_EMAIL_KEY: secret(),
    AUTH_STATUS_INTERNAL_SERVICE_KEY: secret(), AUTH_ONBOARDING_INTERNAL_SERVICE_KEY: secret(),
    TRUSTED_BFF_IP_KEY: secret(),
    JWT_ACCESS_SECRET: secret(), INVENTORY_INTERNAL_SERVICE_KEY: secret(),
    LOGISTICS_INTERNAL_SERVICE_KEY: secret(), NOTIFICATION_INTERNAL_SERVICE_KEY: secret(),
    ANALYTICS_INVENTORY_SERVICE_KEY: secret(), RABBITMQ_PASSWORD: secret(),
    AUTH_RUN_SEED: "true", CATALOG_RUN_SEED: "true", INVENTORY_RUN_SEED: "true",
    NOTIFICATION_DELIVERY_MODE: "log", SMTP_URL: "", GOOGLE_MAPS_BROWSER_KEY: "",
    GOOGLE_MAPS_ROUTES_API_KEY: "", USE_POSTGRES_PERSISTENCE: "false",
    SEED_ADMIN_PASSWORD: "Local!" + secret(), SEED_EMPLOYEE_PASSWORD: "Local!" + secret(), SEED_CUSTOMER_PASSWORD: "Local!" + secret(),
  };
  for (const name of ["AUTH", "CATALOG", "INVENTORY", "PRICING", "ORDERS", "ANALYTICS", "LOGISTICS", "CRM", "NOTIFICATION"]) values[name + "_DB_PASSWORD"] = secret();
  writeFileSync(".env.integration", Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
  console.log("Isolated integration configuration created; secrets were not printed.");
}
