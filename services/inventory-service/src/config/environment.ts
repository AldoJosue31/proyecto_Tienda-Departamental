import { randomBytes } from "node:crypto";

export const AUTH_JWT_ISSUER = "departamental-auth-service";
export const ROLES = ["ADMIN", "EMPLOYEE", "CUSTOMER"] as const;

export type Role = (typeof ROLES)[number];

export interface DatabaseConfig {
  databaseUrl: string;
  databaseSsl: boolean;
}

export interface InventoryRuntimeConfig {
  accessSecret: Buffer;
  corsOrigins: string[];
  environment: string;
  internalServiceSecret: Buffer;
  reservationTtlSeconds: number;
  rabbitmqUrl: string;
  outboxPublishIntervalMilliseconds: number;
  consumerRetryLimit: number;
}

function requiredValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(name + " must be configured.");
  }
  return value;
}

function parsePositiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  maximum: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(name + " must be a positive integer no greater than " + maximum + ".");
  }
  return parsed;
}

function parseBase64UrlSecret(value: string, name: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(name + " must use base64url encoding.");
  }
  const entropy = Buffer.from(value, "base64url");
  if (entropy.length < 32) {
    throw new Error(name + " must decode to at least 32 bytes.");
  }
  return Buffer.from(value, "utf8");
}

function parseOrigins(env: NodeJS.ProcessEnv, environment: string): string[] {
  const configured = env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origins = configured?.length ? configured : ["http://localhost:3000"];
  if (origins.includes("*")) {
    throw new Error("CORS_ORIGINS must not contain a wildcard for this service.");
  }
  if (environment === "production" && !configured?.length) {
    throw new Error("CORS_ORIGINS must be explicitly configured in production.");
  }
  return origins;
}

function parseAmqpUrl(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(name + " must be a valid AMQP URL.");
  }
  if (parsed.protocol !== "amqp:" && parsed.protocol !== "amqps:") {
    throw new Error(name + " must use amqp or amqps.");
  }
  return parsed.toString();
}

export function loadDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const databaseUrl = requiredValue(env, "DATABASE_URL");
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use postgres or postgresql protocol.");
  }
  return {
    databaseUrl,
    databaseSsl: env.DATABASE_SSL?.trim().toLowerCase() === "true",
  };
}

export function loadInventoryRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): InventoryRuntimeConfig {
  const environment = env.NODE_ENV?.trim() || "development";
  return {
    accessSecret: parseBase64UrlSecret(
      requiredValue(env, "JWT_ACCESS_SECRET"),
      "JWT_ACCESS_SECRET",
    ),
    corsOrigins: parseOrigins(env, environment),
    environment,
    internalServiceSecret: parseBase64UrlSecret(
      requiredValue(env, "INVENTORY_INTERNAL_SERVICE_KEY"),
      "INVENTORY_INTERNAL_SERVICE_KEY",
    ),
    reservationTtlSeconds: parsePositiveInteger(
      env,
      "INVENTORY_RESERVATION_TTL_SECONDS",
      900,
      3_600,
    ),
    rabbitmqUrl: parseAmqpUrl(requiredValue(env, "RABBITMQ_URL"), "RABBITMQ_URL"),
    outboxPublishIntervalMilliseconds: parsePositiveInteger(
      env,
      "OUTBOX_PUBLISH_INTERVAL_MILLISECONDS",
      1_000,
      60_000,
    ),
    consumerRetryLimit: parsePositiveInteger(env, "EVENT_CONSUMER_RETRY_LIMIT", 5, 100),
  };
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.includes(value as Role);
}

/** Used only by tests and local configuration examples; never emit this value. */
export function createEphemeralTestSecret(): string {
  return randomBytes(32).toString("base64url");
}
