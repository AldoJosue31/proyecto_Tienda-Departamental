import { CatalogManagement } from "@/components/catalog-management";
import { getCatalogPage } from "@/lib/catalog/catalog-client.server";
import { requireRole } from "@/lib/auth/session.server";

export default async function CatalogManagementPage() {
  await requireRole(["ADMIN"], "/catalog/manage");
  const catalog = await getCatalogPage({ pageSize: 100 });

  return <CatalogManagement products={catalog.items} />;
}
