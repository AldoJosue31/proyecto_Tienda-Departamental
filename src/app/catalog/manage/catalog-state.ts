export type CatalogActionState = {
  status?: "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialCatalogActionState: CatalogActionState = {};
