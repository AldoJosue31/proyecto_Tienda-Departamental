export interface AuthStatusConfig {
  authServiceUrl: string;
  authStatusInternalServiceKey: string;
}

/** A separate credential for the minimum identity-status API; never a human JWT. */
export function loadAuthStatusConfig(env: NodeJS.ProcessEnv = process.env): AuthStatusConfig {
  const key = env.AUTH_STATUS_INTERNAL_SERVICE_KEY?.trim();
  if (!key || !/^[A-Za-z0-9_-]+$/.test(key) || Buffer.from(key, "base64url").length < 32) {
    throw new Error("AUTH_STATUS_INTERNAL_SERVICE_KEY must use base64url encoding with at least 32 bytes.");
  }
  const url = new URL(env.AUTH_SERVICE_URL?.trim() || "http://servicio-autenticacion:3001");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("AUTH_SERVICE_URL must be an HTTP(S) origin without credentials.");
  }
  return { authServiceUrl: url.origin, authStatusInternalServiceKey: key };
}

