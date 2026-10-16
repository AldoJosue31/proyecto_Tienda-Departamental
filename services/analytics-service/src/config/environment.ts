import { loadAuthStatusConfig, type AuthStatusConfig } from "./auth-status";
import { createHmac, randomBytes } from "node:crypto";

export const AUTH_JWT_ISSUER = "departamental-auth-service";
export const ROLES = ["ADMIN", "EMPLOYEE", "CUSTOMER"] as const;
export type Role = (typeof ROLES)[number];

export interface DatabaseConfig { databaseUrl: string; databaseSsl: boolean; }
export interface AnalyticsRuntimeConfig extends AuthStatusConfig {
  accessSecret: Buffer;
  corsOrigins: string[];
  environment: string;
  rabbitmqUrl: string;
  timezone: string;
  inventoryServiceUrl: string;
  inventoryServiceKey: string;
  inventorySyncIntervalSeconds: number;
}

function requiredValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(name + " must be configured.");
  return value;
}

function base64UrlSecret(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || Buffer.from(value, "base64url").length < 32) {
    throw new Error("JWT_ACCESS_SECRET must use base64url encoding with at least 32 bytes.");
  }
  return Buffer.from(value, "utf8");
}

function origins(env: NodeJS.ProcessEnv, environment: string): string[] {
  const configured = env.CORS_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean);
  const result = configured?.length ? configured : ["http://localhost:3000"];
  if (result.includes("*")) throw new Error("CORS_ORIGINS must not contain a wildcard.");
  if (environment === "production" && !configured?.length) throw new Error("CORS_ORIGINS must be explicitly configured in production.");
  return result;
}

function amqp(value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("RABBITMQ_URL must be a valid AMQP URL."); }
  if (parsed.protocol !== "amqp:" && parsed.protocol !== "amqps:") throw new Error("RABBITMQ_URL must use amqp or amqps.");
  return parsed.toString();
}

export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const databaseUrl = requiredValue(env, "DATABASE_URL");
  let parsed: URL;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL."); }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new Error("DATABASE_URL must use postgres or postgresql protocol.");
  return { databaseUrl, databaseSsl: env.DATABASE_SSL?.trim().toLowerCase() === "true" };
}

export function loadAnalyticsRuntimeConfig(env: NodeJS.ProcessEnv = process.env): AnalyticsRuntimeConfig {
  const environment = env.NODE_ENV?.trim() || "development";
  const timezone = env.ANALYTICS_TIMEZONE?.trim() || "America/Mexico_City";
  try { Intl.DateTimeFormat("en-US", { timeZone: timezone }); } catch { throw new Error("ANALYTICS_TIMEZONE must be an IANA timezone."); }
  const inventoryServiceUrl = env.INVENTORY_SERVICE_URL?.trim() || "http://servicio-inventario:3003";
  const inventoryUrl = new URL(inventoryServiceUrl);
  if (!["http:", "https:"].includes(inventoryUrl.protocol)) throw new Error("Invalid Inventory URL");
  const inventoryServiceKey = env.ANALYTICS_INVENTORY_SERVICE_KEY?.trim() || createHmac("sha256", requiredValue(env, "JWT_ACCESS_SECRET")).update("analytics-inventory-snapshot").digest("base64url");
  base64UrlSecret(inventoryServiceKey);
  const inventorySyncIntervalSeconds = Number(env.ANALYTICS_INVENTORY_SYNC_SECONDS || 30);
  if (!Number.isSafeInteger(inventorySyncIntervalSeconds) || inventorySyncIntervalSeconds < 1 || inventorySyncIntervalSeconds > 3600) throw new Error("Invalid inventory sync interval");
  return { ...loadAuthStatusConfig(env), inventoryServiceUrl, inventoryServiceKey, inventorySyncIntervalSeconds, accessSecret: base64UrlSecret(requiredValue(env, "JWT_ACCESS_SECRET")), corsOrigins: origins(env, environment), environment, rabbitmqUrl: amqp(requiredValue(env, "RABBITMQ_URL")), timezone };
}

export function isRole(value: unknown): value is Role { return typeof value === "string" && ROLES.includes(value as Role); }
export function createEphemeralTestSecret(): string { return randomBytes(32).toString("base64url"); }
