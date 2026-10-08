import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";

if (existsSync(".env.integration")) {
  console.log("Existing isolated integration configuration retained.");
} else {
  const secret = () => randomBytes(32).toString("base64url");
  const values = {
    COMPOSE_PROJECT_NAME: "departamental-five-phases", WEB_HOST_PORT: "3105",
    PUBLIC_GATEWAY_URL: "http://localhost:8005", CORS_ALLOWED_ORIGIN: "http://localhost:3105",
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
