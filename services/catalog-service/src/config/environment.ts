import { randomBytes } from "node:crypto";

export const AUTH_JWT_ISSUER = "departamental-auth-service";

export const ROLES = ["ADMIN", "EMPLOYEE", "CUSTOMER"] as const;

export type Role = (typeof ROLES)[number];

export interface DatabaseConfig {
  databaseUrl: string;
  databaseSsl: boolean;
}

export interface CacheConfig {
  redisUrl: string | null;
}

export interface CatalogRuntimeConfig {
  accessSecret: Buffer;
  corsOrigins: string[];
  environment: string;
  searchCacheTtlSeconds: number;
  productCacheTtlSeconds: number;
}

function requiredValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured.`);
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
    throw new Error(`${name} must be a positive integer no greater than ${maximum}.`);
  }
  return parsed;
}

function parseBase64UrlSecret(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("JWT_ACCESS_SECRET must use base64url encoding.");
  }

  const entropy = Buffer.from(value, "base64url");
  if (entropy.length < 32) {
    throw new Error("JWT_ACCESS_SECRET must decode to at least 32 bytes.");
  }

  // Kong receives the configured value as the literal HMAC key. Keep this
  // service byte-compatible with Kong and Auth while requiring high entropy.
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

export function loadCacheConfig(
  env: NodeJS.ProcessEnv = process.env,
): CacheConfig {
  const redisUrl = env.REDIS_URL?.trim();
  if (!redisUrl) {
    return { redisUrl: null };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(redisUrl);
  } catch {
    throw new Error("REDIS_URL must be a valid Redis connection URL.");
  }

  if (parsedUrl.protocol !== "redis:" && parsedUrl.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis or rediss protocol.");
  }
  return { redisUrl };
}

export function loadCatalogRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): CatalogRuntimeConfig {
  const environment = env.NODE_ENV?.trim() || "development";
  return {
    accessSecret: parseBase64UrlSecret(requiredValue(env, "JWT_ACCESS_SECRET")),
    corsOrigins: parseOrigins(env, environment),
    environment,
    searchCacheTtlSeconds: parsePositiveInteger(
      env,
      "CATALOG_SEARCH_CACHE_TTL_SECONDS",
      120,
      3_600,
    ),
    productCacheTtlSeconds: parsePositiveInteger(
      env,
      "CATALOG_PRODUCT_CACHE_TTL_SECONDS",
      600,
      3_600,
    ),
  };
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.includes(value as Role);
}

/** Used only by tests and local configuration examples; never emit this value. */
export function createEphemeralTestSecret(): string {
  return randomBytes(32).toString("base64url");
}
