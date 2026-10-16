import { CatalogManagement } from "@/components/catalog-management";
import { getCatalogPage } from "@/lib/catalog/catalog-client.server";
import { requireRole } from "@/lib/auth/session.server";

export default async function CatalogManagementPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRole(["ADMIN"], "/catalog/manage");
  const search = ((await searchParams).q ?? "").trim().slice(0, 200);
  const catalog = await getCatalogPage({ search, pageSize: 100 });

  return <CatalogManagement products={catalog.items} search={search} total={catalog.total} />;
}
