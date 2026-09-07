import "server-only";

const defaultGatewayUrl = "http://localhost:8000";

export class GatewayRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly correlationId: string,
  ) {
    super(message);
    this.name = "GatewayRequestError";
  }
}

function gatewayUrl() {
  return (process.env.GATEWAY_INTERNAL_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? defaultGatewayUrl).replace(/\/$/, "");
}

export async function gatewayFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const correlationId = headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  headers.set("X-Correlation-Id", correlationId);

  try {
    return await fetch(`${gatewayUrl()}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new GatewayRequestError("No fue posible contactar al API Gateway.", 503, correlationId);
  }
}

export async function gatewayJson<T>(path: string, init: RequestInit = {}) {
  const response = await gatewayFetch(path, init);
  const correlationId = response.headers.get("X-Correlation-Id") ?? crypto.randomUUID();
  const contentType = response.headers.get("content-type") ?? "";
  const body: unknown = contentType.includes("application/json") ? await response.json() : null;

  return { body: body as T, correlationId, response };
}
