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
  "lampara-lumen-arco": "100% 0%",
  "silla-atelier-nordica": "50% 100%",
  "banco-atelier-acento": "50% 100%",
  "tenis-kinetic-trail": "0% 100%",
  "smart-tv-aurora-65": "0% 0%",
  "audifonos-nova-sport": "50% 0%",
  "bocina-nova-pulse": "50% 0%",
  "lampara-lumen-escritorio": "100% 0%",
  "silla-atelier-ergonomica": "50% 100%",
  "reloj-vertex-active": "100% 100%",
  "audifonos-nova-viaje": "50% 0%",
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
