import type { Role } from "./roles";

type Destination = { href: string; label: string; roles: readonly Role[] };

// One order for every view; filtering never substitutes a different destination.
const destinations: readonly Destination[] = [
  { href: "/", label: "Catálogo", roles: ["ADMIN", "EMPLOYEE", "CUSTOMER"] },
  { href: "/catalog/manage", label: "Gestionar catálogo", roles: ["ADMIN"] },
  { href: "/dashboard", label: "Administración", roles: ["ADMIN"] },
  { href: "/operations", label: "Operación", roles: ["ADMIN", "EMPLOYEE"] },
  { href: "/crm", label: "CRM", roles: ["ADMIN"] },
  { href: "/account", label: "Mi cuenta", roles: ["ADMIN", "EMPLOYEE", "CUSTOMER"] },
];

export function navigationForRole(role: Role | null) {
  return destinations.filter((destination) => role === null
    ? destination.href === "/"
    : destination.roles.includes(role));
}

export function isActiveDestination(href: string, pathname: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}
