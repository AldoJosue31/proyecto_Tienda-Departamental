import { CatalogExperience } from "@/components/catalog-experience";
import { getCurrentUser } from "@/lib/auth/session.server";
import { getCatalogPage } from "@/lib/catalog/catalog-client.server";
import { emptyCatalogPage } from "@/lib/catalog/types";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const rawQuery = (await searchParams).q;
  const search = (typeof rawQuery === "string" ? rawQuery : rawQuery?.[0] ?? "").trim().slice(0, 200);
  let initialPage = emptyCatalogPage;
  let initialError = false;
  try {
    initialPage = await getCatalogPage({ search });
  } catch {
    initialError = true;
  }

  let userRole = null;
  try {
    userRole = (await getCurrentUser())?.role ?? null;
  } catch {
    // Browsing must remain available while identity is being recovered.
  }

  return <CatalogExperience key={search} initialPage={initialPage} initialError={initialError} initialSearch={search} userRole={userRole} />;
}
