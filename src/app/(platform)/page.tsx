import { CatalogExperience } from "@/components/catalog-experience";
import { getCurrentUser } from "@/lib/auth/session.server";
import { getCatalogPage } from "@/lib/catalog/catalog-client.server";
import { emptyCatalogPage } from "@/lib/catalog/types";

export default async function Home() {
  let initialPage = emptyCatalogPage;
  let initialError = false;
  try {
    initialPage = await getCatalogPage();
  } catch {
    initialError = true;
  }

  let userRole = null;
  try {
    userRole = (await getCurrentUser())?.role ?? null;
  } catch {
    // Browsing must remain available while identity is being recovered.
  }

  return <CatalogExperience initialPage={initialPage} initialError={initialError} userRole={userRole} />;
}
