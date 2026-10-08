import "server-only";

export function publicGatewayUrl(): string {
  const url = new URL(process.env.PUBLIC_GATEWAY_URL?.trim() || "http://localhost:8000");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("PUBLIC_GATEWAY_URL inválida");
  return url.origin;
}
