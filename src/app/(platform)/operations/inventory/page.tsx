import { InventoryReplenishmentDesk } from "@/components/inventory-replenishment-desk";
import { requireRole } from "@/lib/auth/session.server";
import { getCatalogPage } from "@/lib/catalog/catalog-client.server";
import { getInventoryDashboard } from "@/lib/inventory/dashboard.server";

export default async function InventoryOperationsPage() {
  await requireRole(["ADMIN", "EMPLOYEE"], "/operations/inventory");
  const [catalog, inventory] = await Promise.allSettled([
    getCatalogPage({ pageSize: 100 }),
    getInventoryDashboard(),
  ]);

  return (
    <InventoryReplenishmentDesk
      initialCatalog={catalog.status === "fulfilled" ? catalog.value : null}
      initialInventory={inventory.status === "fulfilled" ? inventory.value : null}
    />
  );
}
