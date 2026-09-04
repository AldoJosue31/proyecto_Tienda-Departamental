import { randomBytes } from "node:crypto";

export const AUTH_JWT_ISSUER = "departamental-auth-service";
export const ROLES = ["ADMIN", "EMPLOYEE", "CUSTOMER"] as const;

export type Role = (typeof ROLES)[number];

export interface RealtimeRuntimeConfig {
  accessSecret: Buffer;
  corsOrigins: string[];
  environment: string;
  rabbitmqUrl: string;
}

function requiredValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(name + " must be configured.");
  return value;
}

function parseBase64UrlSecret(value: string, name: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(name + " must use base64url encoding.");
  }
  if (Buffer.from(value, "base64url").length < 32) {
    throw new Error(name + " must decode to at least 32 bytes.");
  }
  return Buffer.from(value, "utf8");
}

function parseOrigins(env: NodeJS.ProcessEnv, environment: string): string[] {
  const configured = env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origins = configured?.length ? configured : ["http://localhost:3000"];
  if (origins.includes("*")) throw new Error("CORS_ORIGINS must not contain a wildcard.");
  if (environment === "production" && !configured?.length) {
    throw new Error("CORS_ORIGINS must be explicitly configured in production.");
  }
  return origins;
}

function parseAmqpUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("RABBITMQ_URL must be a valid AMQP URL.");
  }
  if (parsed.protocol !== "amqp:" && parsed.protocol !== "amqps:") {
    throw new Error("RABBITMQ_URL must use amqp or amqps.");
  }
  return parsed.toString();
}

export function loadRealtimeRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RealtimeRuntimeConfig {
  const environment = env.NODE_ENV?.trim() || "development";
  return {
    accessSecret: parseBase64UrlSecret(requiredValue(env, "JWT_ACCESS_SECRET"), "JWT_ACCESS_SECRET"),
    corsOrigins: parseOrigins(env, environment),
    environment,
    rabbitmqUrl: parseAmqpUrl(requiredValue(env, "RABBITMQ_URL")),
  };
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.includes(value as Role);
}

/** Used only by tests and never returned from an HTTP or socket response. */
export function createEphemeralTestSecret(): string {
  return randomBytes(32).toString("base64url");
}
