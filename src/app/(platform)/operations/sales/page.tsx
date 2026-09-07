import { PhysicalSalesDesk } from "@/components/physical-sales-desk";
import { requireRole } from "@/lib/auth/session.server";
import { getCatalogPage } from "@/lib/catalog/catalog-client.server";
import { emptyCatalogPage } from "@/lib/catalog/types";
import { getInventoryDashboard } from "@/lib/inventory/dashboard.server";

export default async function PhysicalSalesPage() {
  await requireRole(["ADMIN", "EMPLOYEE"], "/operations/sales");
  const [catalog, inventory] = await Promise.all([
    getCatalogPage({ pageSize: 100 }).then((data) => ({ data, failed: false })).catch(() => ({ data: emptyCatalogPage, failed: true })),
    getInventoryDashboard().then((data) => ({ data, failed: false })).catch(() => ({ data: null, failed: true })),
  ]);

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-9 sm:px-6 lg:px-8 lg:py-12">
      <PhysicalSalesDesk
        initialCatalog={catalog.data}
        initialCatalogFailed={catalog.failed}
        initialInventory={inventory.data}
        initialInventoryFailed={inventory.failed}
      />
    </section>
  );
}
