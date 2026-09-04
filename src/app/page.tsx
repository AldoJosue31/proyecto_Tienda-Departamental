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

  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // The public catalog remains available while identity is temporarily down.
  }
  return <CatalogExperience initialPage={initialPage} initialError={initialError} user={user} />;
}
