import { CatalogExperience } from "@/components/catalog-experience";
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

  return <CatalogExperience initialPage={initialPage} initialError={initialError} />;
}
