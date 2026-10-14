// Every cookie-authenticated JSON mutation crosses this boundary before Next
// can forward the session's JWT to Kong. Browser Origin cannot be forged by JS.
export function allowsCookieApiMutation(request, configuredOrigin) {
  if (!/^(POST|PUT|PATCH|DELETE)$/i.test(request.method || "GET") || !(request.url || "").startsWith("/api/")) return true;
  if (!/(?:^|;\s*)departamental_(?:access|refresh)=/.test(request.headers.cookie || "")) return true;
  const origin = request.headers.origin;
  if (typeof origin !== "string" || origin !== configuredOrigin) return false;
  const site = request.headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin") return false;
  return typeof request.headers["content-type"] === "string" && /^application\/json(?:\s*;.*)?$/i.test(request.headers["content-type"]);
}
