export const ROLES = ["ADMIN", "EMPLOYEE", "CUSTOMER"] as const;

export type Role = (typeof ROLES)[number];

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export function hasRole(user: Pick<SessionUser, "role"> | null, allowedRoles: readonly Role[]) {
  return user !== null && allowedRoles.includes(user.role);
}

export const roleLabel: Record<Role, string> = {
  ADMIN: "Administración",
  EMPLOYEE: "Operación",
  CUSTOMER: "Cliente",
};
