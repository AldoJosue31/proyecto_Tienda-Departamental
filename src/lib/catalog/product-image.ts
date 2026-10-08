import type { CSSProperties } from "react";

type ProductImage = {
  imageUrl: string | null;
  slug: string;
};

const spritePositionBySlug: Record<string, string> = {
  "smart-tv-aurora-55": "0% 0%",
  "audifonos-nova-anc": "50% 0%",
  "lampara-lumen-mesa": "100% 0%",
  "tenis-kinetic-run": "0% 100%",
  "silla-atelier": "50% 100%",
  "reloj-vertex-fit": "100% 100%",
};

/** Keeps product previews aligned whether they appear in Catalog or in the bag. */
export function catalogProductImageStyle(product: ProductImage): CSSProperties | undefined {
  const source = product.imageUrl;
  if (!source) return undefined;

  if (source.includes("departmental-products-v1.png")) {
    return {
      backgroundImage: `url("${source}")`,
      backgroundPosition: spritePositionBySlug[product.slug] ?? "50% 50%",
      backgroundSize: "300% 200%",
    };
  }

  return {
    backgroundImage: `url("${source}")`,
    backgroundPosition: "center",
    backgroundSize: "cover",
  };
}
