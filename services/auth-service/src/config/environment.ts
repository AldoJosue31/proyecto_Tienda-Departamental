import { randomBytes } from "node:crypto";

export const AUTH_JWT_ISSUER = "departamental-auth-service";

export const ROLES = ["ADMIN", "EMPLOYEE", "CUSTOMER"] as const;

export type Role = (typeof ROLES)[number];

export interface DatabaseConfig {
  databaseUrl: string;
  databaseSsl: boolean;
}

export interface AuthTokenConfig {
  accessSecret: Buffer;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  corsOrigins: string[];
  environment: string;
}

export interface NotificationInternalConfig {
  serviceKey: Buffer;
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
): number {
  const raw = env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
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

  // Kong's declarative JWT credential receives the environment value as its
  // literal HMAC key. Keep Nest on those same bytes; base64url is used here as
  // a transport-safe, high-entropy format rather than decoded signing input.
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

export function loadAuthTokenConfig(
  env: NodeJS.ProcessEnv = process.env,
): AuthTokenConfig {
  const environment = env.NODE_ENV?.trim() || "development";
  const accessSecret = parseBase64UrlSecret(requiredValue(env, "JWT_ACCESS_SECRET"));
  const accessTtlSeconds = parsePositiveInteger(
    env,
    "JWT_ACCESS_TTL_SECONDS",
    15 * 60,
  );
  const refreshDays = parsePositiveInteger(env, "JWT_REFRESH_TTL_DAYS", 30);

  return {
    accessSecret,
    accessTtlSeconds,
    refreshTtlSeconds: refreshDays * 24 * 60 * 60,
    corsOrigins: parseOrigins(env, environment),
    environment,
  };
}

export function loadNotificationInternalConfig(
  env: NodeJS.ProcessEnv = process.env,
): NotificationInternalConfig {
  return {
    serviceKey: parseBase64UrlSecret(
      requiredValue(env, "NOTIFICATION_INTERNAL_SERVICE_KEY"),
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
