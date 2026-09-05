import { CrmWorkspace } from "@/components/crm-workspace";
import { requireRole } from "@/lib/auth/session.server";
import { getCrmCustomers, getInactiveCustomers } from "@/lib/crm/crm.server";

export default async function CrmPage() {
  await requireRole(["ADMIN"], "/crm");
  const [initialCustomers, initialSegment] = await Promise.all([getCrmCustomers().catch(() => null), getInactiveCustomers(3).catch(() => null)]);
  return <CrmWorkspace initialCustomers={initialCustomers} initialSegment={initialSegment} />;
}
