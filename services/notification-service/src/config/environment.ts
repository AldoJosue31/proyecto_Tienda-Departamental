export interface DatabaseConfig { databaseUrl: string; databaseSsl: boolean; }
export interface NotificationRuntimeConfig {
  environment: string;
  rabbitmqUrl: string;
  authServiceUrl: string;
  internalServiceKey: string;
  deliveryMode: "log" | "smtp";
  smtpUrl: string | null;
  fromEmail: string;
  outboxPublishIntervalMilliseconds: number;
  retryIntervalSeconds: number;
  retryLimit: number;
}

function required(env: NodeJS.ProcessEnv, name: string): string { const value = env[name]?.trim(); if (!value) throw new Error(name + " must be configured."); return value; }
function base64url(value: string, name: string): string { if (!/^[A-Za-z0-9_-]+$/.test(value) || Buffer.from(value, "base64url").length < 32) throw new Error(name + " must use base64url encoding with at least 32 bytes."); return value; }
function url(value: string, name: string, protocols: string[]): string { let parsed: URL; try { parsed = new URL(value); } catch { throw new Error(name + " must be a valid URL."); } if (!protocols.includes(parsed.protocol)) throw new Error(name + " uses an unsupported protocol."); return parsed.toString().replace(/\/$/, ""); }
function positive(env: NodeJS.ProcessEnv, name: string, fallback: number, maximum: number): number { const raw = env[name]?.trim(); if (!raw) return fallback; const value = Number(raw); if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(name + " must be a positive integer no greater than " + maximum + "."); return value; }
function origins(env: NodeJS.ProcessEnv, environment: string): string[] { const result = env.CORS_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean) ?? ["http://localhost:3000"]; if (result.includes("*") || (environment === "production" && !env.CORS_ORIGINS?.trim())) throw new Error("CORS_ORIGINS must list explicit origins."); return result; }

export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig { const databaseUrl = required(env, "DATABASE_URL"); url(databaseUrl, "DATABASE_URL", ["postgres:", "postgresql:"]); return { databaseUrl, databaseSsl: env.DATABASE_SSL?.trim().toLowerCase() === "true" }; }
export function loadNotificationRuntimeConfig(env: NodeJS.ProcessEnv = process.env): NotificationRuntimeConfig {
  const environment = env.NODE_ENV?.trim() || "development";
  const deliveryMode = env.NOTIFICATION_DELIVERY_MODE?.trim().toLowerCase() || "log";
  if (deliveryMode !== "log" && deliveryMode !== "smtp") throw new Error("NOTIFICATION_DELIVERY_MODE must be log or smtp.");
  const smtpUrl = deliveryMode === "smtp" ? url(required(env, "SMTP_URL"), "SMTP_URL", ["smtp:", "smtps:"]) : null;
  return { environment, rabbitmqUrl: url(required(env, "RABBITMQ_URL"), "RABBITMQ_URL", ["amqp:", "amqps:"]), authServiceUrl: url(required(env, "AUTH_SERVICE_URL"), "AUTH_SERVICE_URL", ["http:", "https:"]), internalServiceKey: base64url(required(env, "NOTIFICATION_INTERNAL_SERVICE_KEY"), "NOTIFICATION_INTERNAL_SERVICE_KEY"), deliveryMode, smtpUrl, fromEmail: env.NOTIFICATION_FROM_EMAIL?.trim() || "promociones@departamental.local", outboxPublishIntervalMilliseconds: positive(env, "OUTBOX_PUBLISH_INTERVAL_MILLISECONDS", 1_000, 60_000), retryIntervalSeconds: positive(env, "NOTIFICATION_RETRY_INTERVAL_SECONDS", 10, 3_600), retryLimit: positive(env, "NOTIFICATION_RETRY_LIMIT", 3, 10) };
}
export function loadCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] { return origins(env, env.NODE_ENV?.trim() || "development"); }
