import { randomBytes } from "node:crypto";

export const AUTH_JWT_ISSUER = "departamental-auth-service";
export const ROLES = ["ADMIN", "EMPLOYEE", "CUSTOMER"] as const;
export type Role = (typeof ROLES)[number];

export interface DatabaseConfig {
  databaseUrl: string;
  databaseSsl: boolean;
}

export interface PricingRuntimeConfig {
  accessSecret: Buffer;
  corsOrigins: string[];
  environment: string;
  schedulerIntervalSeconds: number;
  rabbitmqUrl: string;
  outboxPublishIntervalMilliseconds: number;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(name + " must be configured.");
  return value;
}

function positive(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  maximum: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(name + " must be a positive integer no greater than " + maximum + ".");
  }
  return value;
}

function secret(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("JWT_ACCESS_SECRET must use base64url encoding.");
  }
  if (Buffer.from(value, "base64url").length < 32) {
    throw new Error("JWT_ACCESS_SECRET must decode to at least 32 bytes.");
  }
  return Buffer.from(value, "utf8");
}

function origins(env: NodeJS.ProcessEnv, environment: string): string[] {
  const configured = env.CORS_ORIGINS?.split(",").map((item) => item.trim()).filter(Boolean);
  const value = configured?.length ? configured : ["http://localhost:3000"];
  if (value.includes("*")) throw new Error("CORS_ORIGINS must not contain a wildcard.");
  if (environment === "production" && !configured?.length) {
    throw new Error("CORS_ORIGINS must be explicitly configured in production.");
  }
  return value;
}

function amqpUrl(value: string, name: string): string {
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

export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const databaseUrl = required(env, "DATABASE_URL");
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use postgres or postgresql protocol.");
  }
  return {
    databaseUrl,
    databaseSsl: env.DATABASE_SSL?.trim().toLowerCase() === "true",
  };
}

export function loadPricingRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): PricingRuntimeConfig {
  const environment = env.NODE_ENV?.trim() || "development";
  return {
    accessSecret: secret(required(env, "JWT_ACCESS_SECRET")),
    corsOrigins: origins(env, environment),
    environment,
    schedulerIntervalSeconds: positive(
      env,
      "PRICING_SCHEDULER_INTERVAL_SECONDS",
      30,
      300,
    ),
    rabbitmqUrl: amqpUrl(required(env, "RABBITMQ_URL"), "RABBITMQ_URL"),
    outboxPublishIntervalMilliseconds: positive(
      env,
      "OUTBOX_PUBLISH_INTERVAL_MILLISECONDS",
      1_000,
      60_000,
    ),
  };
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.includes(value as Role);
}

export function createEphemeralTestSecret(): string {
  return randomBytes(32).toString("base64url");
}
