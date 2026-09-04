import { SessionRefresher } from "@/components/auth/session-refresher";
import { InventoryDashboardView } from "@/components/inventory-dashboard";
import { getAnalyticsDashboard } from "@/lib/analytics/dashboard.server";
import { requireRole } from "@/lib/auth/session.server";
import { getInventoryDashboard } from "@/lib/inventory/dashboard.server";

export default async function DashboardPage() {
  await requireRole(["ADMIN"], "/dashboard");
  const [initialDashboard, initialAnalytics] = await Promise.all([
    getInventoryDashboard(),
    getAnalyticsDashboard().catch(() => null),
  ]);
  return <><SessionRefresher /><InventoryDashboardView initialDashboard={initialDashboard} initialAnalytics={initialAnalytics} /></>;
}
