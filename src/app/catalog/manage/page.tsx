import { CatalogManagement } from "@/components/catalog-management";
import { AppShell } from "@/components/app-shell";
import { getCatalogPage } from "@/lib/catalog/catalog-client.server";
import { requireRole } from "@/lib/auth/session.server";

export default async function CatalogManagementPage() {
  const user = await requireRole(["ADMIN"], "/catalog/manage");
  const catalog = await getCatalogPage({ pageSize: 100 });

  return <AppShell user={user} activePath="/catalog/manage"><CatalogManagement products={catalog.items} /></AppShell>;
}
