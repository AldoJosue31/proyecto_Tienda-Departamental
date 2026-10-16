import { EmployeesWorkspace } from "@/components/employees-workspace";
import { getEmployees } from "@/lib/auth/employees.server";
import { requireRole } from "@/lib/auth/session.server";

export default async function UsersPage() {
  await requireRole(["ADMIN"], "/users");
  return <EmployeesWorkspace initialData={await getEmployees().catch(() => null)} />;
}
