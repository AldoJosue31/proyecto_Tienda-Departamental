import type { Role } from "./roles";

const routes: Record<Role, readonly string[]> = {
  ADMIN: ["/catalog/manage", "/promotions", "/dashboard", "/operations", "/crm", "/users", "/account", "/checkout", "/orders"],
  EMPLOYEE: ["/operations", "/account"],
  CUSTOMER: ["/checkout", "/orders", "/account"],
};

export function safeReturnPath(value: unknown, role: Role = "CUSTOMER"): string {
  if (typeof value !== "string" || value.length > 512 || !value.startsWith("/") || value.startsWith("//")
    || value.includes("\\") || Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return "/";
  try {
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid" || /%(?:2f|5c|00|0a|0d|7f)/i.test(url.pathname)
      || [...url.searchParams.keys()].some(name => /token|password|secret|nonce|csrf/i.test(name))) return "/";
    if (url.pathname !== "/" && !routes[role].some(prefix => url.pathname === prefix || url.pathname.startsWith(prefix + "/"))) return "/";
    return url.pathname + url.search;
  } catch { return "/"; }
}
