import { CatalogExperience } from "@/components/catalog-experience";
import { getCurrentUser } from "@/lib/auth/session.server";
import { getCatalogPage } from "@/lib/catalog/catalog-client.server";
import { emptyCatalogPage } from "@/lib/catalog/types";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const rawQuery = params.q;
  const search = (typeof rawQuery === "string" ? rawQuery : rawQuery?.[0] ?? "").trim().slice(0, 200);
  const text = (key: string) => (typeof params[key] === "string" ? params[key] : params[key]?.[0] ?? "").trim().slice(0, 200);
  const rawPage = Number(text("page") || 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  let initialPage = emptyCatalogPage;
  let initialError = false;
  try {
    initialPage = await getCatalogPage({ search, category: text("category"), brand: text("brand"), page });
  } catch {
    initialError = true;
  }

  let userRole = null;
  try {
    userRole = (await getCurrentUser())?.role ?? null;
  } catch {
    // Browsing must remain available while identity is being recovered.
  }

  return <CatalogExperience key={search} initialPage={initialPage} initialError={initialError} initialSearch={search} initialCategory={text("category")} initialBrand={text("brand")} userRole={userRole} />;
}
