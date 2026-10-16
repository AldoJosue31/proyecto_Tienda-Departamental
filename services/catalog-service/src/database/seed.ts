import { Pool, type PoolClient } from "pg";

import "../config/load-env";
import { loadDatabaseConfig } from "../config/environment";

interface SeedVariant {
  id: string;
  sku: string;
  size?: string;
  color?: string;
  material?: string;
  listPrice: number;
}

interface SeedProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: { name: string; slug: string };
  brand: { name: string; slug: string };
  tags: string[];
  imageUrl: string;
  variant?: SeedVariant;
  variants?: SeedVariant[];
}

interface SeedOption {
  name: string;
  code: string;
}

function variantMatrix(
  productNumber: number,
  skuPrefix: string,
  colors: readonly SeedOption[],
  materials: readonly SeedOption[],
  basePrice: number,
  sizePriceStep: number,
  materialPriceStep: number,
): SeedVariant[] {
  let sequence = 0;
  return ["S", "M", "L"].flatMap((size, sizeIndex) =>
    colors.flatMap((color) =>
      materials.map((material, materialIndex) => {
        sequence += 1;
        return {
          id: `a2000000-0000-4000-8000-${String(productNumber * 100 + sequence).padStart(12, "0")}`,
          sku: `${skuPrefix}-${size}-${color.code}-${material.code}`,
          size,
          color: color.name,
          material: material.name,
          listPrice: basePrice + sizeIndex * sizePriceStep + materialIndex * materialPriceStep,
        };
      }),
    ),
  );
}

const IMAGE_URL = "/catalog/departmental-products-v1.png";

const products: SeedProduct[] = [
  {
    id: "a1000000-0000-4000-8000-000000000001",
    slug: "smart-tv-aurora-55",
    name: "Smart TV Aurora 55\" 4K",
    description: "Panel 4K con HDR y sistema de entretenimiento integrado.",
    category: { name: "Electrónica", slug: "electronica" },
    brand: { name: "Aurora", slug: "aurora" },
    tags: ["4K", "HDR", "55 pulgadas"],
    imageUrl: IMAGE_URL,
    variant: {
      id: "a2000000-0000-4000-8000-000000000001",
      sku: "AUR-55-4K",
      size: "55 pulgadas",
      listPrice: 12_999,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000002",
    slug: "audifonos-nova-anc",
    name: "Audífonos Nova ANC",
    description: "Cancelación adaptativa de ruido y 32 horas de batería.",
    category: { name: "Electrónica", slug: "electronica" },
    brand: { name: "Nova", slug: "nova" },
    tags: ["Bluetooth", "ANC", "Audio"],
    imageUrl: IMAGE_URL,
    variant: {
      id: "a2000000-0000-4000-8000-000000000002",
      sku: "NOV-ANC-01",
      color: "Grafito",
      listPrice: 2_899,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000003",
    slug: "lampara-lumen-mesa",
    name: "Lámpara Lumen de mesa",
    description: "Iluminación cálida regulable para sala o escritorio.",
    category: { name: "Hogar", slug: "hogar" },
    brand: { name: "Lumen", slug: "lumen" },
    tags: ["LED", "Regulable", "Hogar"],
    imageUrl: IMAGE_URL,
    variant: {
      id: "a2000000-0000-4000-8000-000000000003",
      sku: "LUM-DESK-01",
      color: "Arena",
      listPrice: 1_499,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000004",
    slug: "tenis-kinetic-run",
    name: "Tenis Kinetic Run",
    description: "Amortiguación reactiva para entrenamiento diario.",
    category: { name: "Deportes", slug: "deportes" },
    brand: { name: "Kinetic", slug: "kinetic" },
    tags: ["Running", "Ligero", "Unisex"],
    imageUrl: IMAGE_URL,
    variant: {
      id: "a2000000-0000-4000-8000-000000000004",
      sku: "KIN-RUN-26",
      size: "26",
      color: "Gris",
      material: "Textil",
      listPrice: 2_199,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000005",
    slug: "silla-atelier",
    name: "Silla Atelier",
    description: "Silla de acento con estructura de madera certificada.",
    category: { name: "Hogar", slug: "hogar" },
    brand: { name: "Atelier", slug: "atelier" },
    tags: ["Madera", "Diseño", "Sala"],
    imageUrl: IMAGE_URL,
    variant: {
      id: "a2000000-0000-4000-8000-000000000005",
      sku: "ATL-CHR-01",
      color: "Terracota",
      material: "Madera",
      listPrice: 4_699,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000006",
    slug: "reloj-vertex-fit",
    name: "Reloj Vertex Fit",
    description: "Métricas de actividad, sueño y recuperación.",
    category: { name: "Deportes", slug: "deportes" },
    brand: { name: "Vertex", slug: "vertex" },
    tags: ["GPS", "Salud", "Resistente"],
    imageUrl: IMAGE_URL,
    variant: {
      id: "a2000000-0000-4000-8000-000000000006",
      sku: "VTX-FIT-02",
      color: "Negro",
      material: "Aluminio",
      listPrice: 3_499,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000007",
    slug: "cafetera-bruma-espresso",
    name: "Cafetera Bruma Espresso",
    description: "Cafetera compacta con portafiltro y vaporizador para preparar espresso en casa.",
    category: { name: "Cocina", slug: "cocina" },
    brand: { name: "Bruma", slug: "bruma" },
    tags: ["Café", "Espresso", "Compacta"],
    imageUrl: "/catalog/cafetera-bruma-espresso.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000007",
      sku: "BRU-ESP-01",
      color: "Marfil",
      material: "Acero",
      listPrice: 3_499,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000008",
    slug: "licuadora-nara-personal",
    name: "Licuadora Nara Personal",
    description: "Licuadora de tamaño personal con vaso transparente y controles sencillos.",
    category: { name: "Cocina", slug: "cocina" },
    brand: { name: "Nara", slug: "nara" },
    tags: ["Licuadora", "Personal", "Cocina"],
    imageUrl: "/catalog/licuadora-nara-personal.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000008",
      sku: "NAR-BLD-01",
      color: "Verde salvia",
      listPrice: 1_299,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000009",
    slug: "mochila-vento-urbana",
    name: "Mochila Vento Urbana",
    description: "Mochila de uso diario con compartimento principal y bolsillo frontal.",
    category: { name: "Viajes", slug: "viajes" },
    brand: { name: "Vento", slug: "vento" },
    tags: ["Mochila", "Urbana", "Viaje"],
    imageUrl: "/catalog/mochila-vento-urbana.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000009",
      sku: "VEN-BAG-01",
      color: "Grafito",
      material: "Textil",
      listPrice: 1_599,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000010",
    slug: "maleta-nomad-cabina",
    name: "Maleta Nomad de cabina",
    description: "Maleta rígida de cabina con cuatro ruedas y asa telescópica.",
    category: { name: "Viajes", slug: "viajes" },
    brand: { name: "Nomad", slug: "nomad" },
    tags: ["Maleta", "Cabina", "Viaje"],
    imageUrl: "/catalog/maleta-nomad-cabina.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000010",
      sku: "NOM-CAB-01",
      size: "Cabina",
      color: "Terracota",
      material: "Policarbonato",
      listPrice: 3_299,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000011",
    slug: "serum-clara-hidratante",
    name: "Sérum Clara hidratante",
    description: "Sérum facial de uso diario en frasco de vidrio con gotero.",
    category: { name: "Belleza", slug: "belleza" },
    brand: { name: "Clara", slug: "clara" },
    tags: ["Cuidado facial", "Sérum", "Hidratación"],
    imageUrl: "/catalog/serum-clara-hidratante.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000011",
      sku: "CLA-SER-30",
      size: "30 ml",
      material: "Vidrio",
      listPrice: 549,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000012",
    slug: "escritorio-luma-compacto",
    name: "Escritorio Luma compacto",
    description: "Escritorio de madera clara con cajón, ideal para espacios de trabajo pequeños.",
    category: { name: "Oficina", slug: "oficina" },
    brand: { name: "Luma", slug: "luma" },
    tags: ["Escritorio", "Madera", "Home office"],
    imageUrl: "/catalog/escritorio-luma-compacto.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000012",
      sku: "LUM-DESK-120",
      size: "120 cm",
      color: "Roble claro",
      material: "Madera",
      listPrice: 4_999,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000013",
    slug: "camara-prisma-instantanea",
    name: "Cámara Prisma instantánea",
    description: "Cámara compacta de fotografía instantánea con flash integrado.",
    category: { name: "Electrónica", slug: "electronica" },
    brand: { name: "Prisma", slug: "prisma" },
    tags: ["Fotografía", "Instantánea", "Cámara"],
    imageUrl: "/catalog/camara-prisma-instantanea.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000013",
      sku: "PRI-CAM-01",
      color: "Azul cielo",
      listPrice: 2_499,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000014",
    slug: "bloques-tilo-madera",
    name: "Bloques Tilo de madera",
    description: "Juego de bloques de madera con formas y colores suaves para construir.",
    category: { name: "Juguetes", slug: "juguetes" },
    brand: { name: "Tilo", slug: "tilo" },
    tags: ["Construcción", "Madera", "Creatividad"],
    imageUrl: "/catalog/bloques-tilo-madera.png",
    variant: {
      id: "a2000000-0000-4000-8000-000000000014",
      sku: "TIL-BLK-01",
      color: "Multicolor",
      material: "Madera",
      listPrice: 899,
    },
  },
  {
    id: "a1000000-0000-4000-8000-000000000015",
    slug: "camisa-aural-relajada",
    name: "Camisa Aural relajada",
    description: "Camisa de manga larga y corte relajado para combinar a diario.",
    category: { name: "Moda", slug: "moda" },
    brand: { name: "Aural", slug: "aural" },
    tags: ["Camisa", "Unisex", "Tallas S M L"],
    imageUrl: "/catalog/camisa-aural-relajada.png",
    variants: variantMatrix(15, "AUR-CAM", [
      { name: "Marfil", code: "MAR" },
      { name: "Azul petróleo", code: "AZP" },
    ], [
      { name: "Algodón", code: "ALG" },
      { name: "Lino", code: "LIN" },
    ], 899, 40, 180),
  },
  {
    id: "a1000000-0000-4000-8000-000000000016",
    slug: "sudadera-boreal-capucha",
    name: "Sudadera Boreal con capucha",
    description: "Sudadera unisex de corte cómodo con capucha y bolsillo frontal.",
    category: { name: "Moda", slug: "moda" },
    brand: { name: "Boreal", slug: "boreal" },
    tags: ["Sudadera", "Unisex", "Tallas S M L"],
    imageUrl: "/catalog/sudadera-boreal-capucha.png",
    variants: variantMatrix(16, "BOR-SUD", [
      { name: "Verde pino", code: "PIN" },
      { name: "Arena", code: "ARE" },
    ], [
      { name: "Algodón", code: "ALG" },
      { name: "Felpa reciclada", code: "FEL" },
    ], 1_199, 60, 200),
  },
  {
    id: "a1000000-0000-4000-8000-000000000017",
    slug: "pantalon-terral-cargo",
    name: "Pantalón Terral cargo",
    description: "Pantalón unisex de corte relajado con bolsillos laterales.",
    category: { name: "Moda", slug: "moda" },
    brand: { name: "Terral", slug: "terral" },
    tags: ["Pantalón", "Cargo", "Tallas S M L"],
    imageUrl: "/catalog/pantalon-terral-cargo.png",
    variants: variantMatrix(17, "TER-PAN", [
      { name: "Caqui", code: "CAQ" },
      { name: "Grafito", code: "GRA" },
    ], [
      { name: "Algodón", code: "ALG" },
      { name: "Sarga reciclada", code: "SAR" },
    ], 1_099, 50, 170),
  },
  {
    id: "a1000000-0000-4000-8000-000000000018",
    slug: "chamarra-brisa-cortaviento",
    name: "Chamarra Brisa cortaviento",
    description: "Chamarra ligera con cierre, capucha y tejido de secado rápido.",
    category: { name: "Deportes", slug: "deportes" },
    brand: { name: "Brisa", slug: "brisa" },
    tags: ["Chamarra", "Exterior", "Tallas S M L"],
    imageUrl: "/catalog/chamarra-brisa-cortaviento.png",
    variants: variantMatrix(18, "BRI-CHA", [
      { name: "Azul petróleo", code: "AZP" },
      { name: "Negro", code: "NEG" },
    ], [
      { name: "Nylon", code: "NYL" },
      { name: "Poliéster reciclado", code: "POL" },
    ], 1_799, 80, 250),
  },
  {
    id: "a1000000-0000-4000-8000-000000000019",
    slug: "mandil-oliva-cocina",
    name: "Mandil Oliva de cocina",
    description: "Mandil ajustable con bolsillos frontales para cocinar con comodidad.",
    category: { name: "Cocina", slug: "cocina" },
    brand: { name: "Oliva", slug: "oliva" },
    tags: ["Mandil", "Cocina", "Tallas S M L"],
    imageUrl: "/catalog/mandil-oliva-cocina.png",
    variants: variantMatrix(19, "OLI-MAN", [
      { name: "Terracota", code: "TER" },
      { name: "Azul marino", code: "AZM" },
    ], [
      { name: "Lona de algodón", code: "LON" },
      { name: "Lino", code: "LIN" },
    ], 549, 30, 120),
  },
  {
    id: "a1000000-0000-4000-8000-000000000020",
    slug: "cama-nido-mascotas",
    name: "Cama Nido para mascotas",
    description: "Cama acolchada con bordes suaves y cojín central removible.",
    category: { name: "Mascotas", slug: "mascotas" },
    brand: { name: "Nido", slug: "nido" },
    tags: ["Mascotas", "Cama", "Tallas S M L"],
    imageUrl: "/catalog/cama-nido-mascotas.png",
    variants: variantMatrix(20, "NID-CAM", [
      { name: "Arena", code: "ARE" },
      { name: "Terracota", code: "TER" },
    ], [
      { name: "Lona", code: "LON" },
      { name: "Terciopelo", code: "VEL" },
    ], 899, 250, 180),
  },
];

interface ExpandedProductSpec {
  name: string;
  slug: string;
  description: string;
  tags: string[];
  basePrice: number;
}

interface ExpandedProductGroup {
  category: SeedProduct["category"];
  brands: readonly [SeedProduct["brand"], ...SeedProduct["brand"][]];
  images: readonly [string, ...string[]];
  variantField: "color" | "size";
  variantOptions: readonly [string, ...string[]];
  priceStep: number;
  products: ExpandedProductSpec[];
}

const expandedProductGroups: ExpandedProductGroup[] = [
  {
    category: { name: "Cocina", slug: "cocina" },
    brands: [
      { name: "Bruma", slug: "bruma" },
      { name: "Nara", slug: "nara" },
      { name: "Oliva", slug: "oliva" },
    ],
    images: [
      "/catalog/cafetera-bruma-espresso.png",
      "/catalog/licuadora-nara-personal.png",
      "/catalog/mandil-oliva-cocina.png",
    ],
    variantField: "color",
    variantOptions: ["Marfil", "Grafito", "Verde salvia"],
    priceStep: 80,
    products: [
      { slug: "molino-cafe-bruma", name: "Molino de café Bruma", description: "Muele granos al momento con ajuste para distintos métodos de preparación.", tags: ["Café", "Molienda", "Cocina"], basePrice: 1_299 },
      { slug: "hervidor-nara-temperatura", name: "Hervidor Nara con temperatura", description: "Hervidor eléctrico con selección de temperatura para té y café.", tags: ["Hervidor", "Té", "Temperatura"], basePrice: 1_499 },
      { slug: "tostador-bruma-compacto", name: "Tostador Bruma compacto", description: "Tostador de dos rebanadas con niveles ajustables y charola para migas.", tags: ["Desayuno", "Tostador", "Compacto"], basePrice: 999 },
      { slug: "procesador-nara-cocina", name: "Procesador Nara de cocina", description: "Procesador multiusos con cuchillas de acero y recipiente de gran capacidad.", tags: ["Procesador", "Preparación", "Acero"], basePrice: 2_199 },
      { slug: "mandil-oliva-pro", name: "Mandil Oliva Pro", description: "Mandil de lona con tirantes ajustables y bolsillos reforzados.", tags: ["Mandil", "Lona", "Cocina"], basePrice: 649 },
    ],
  },
  {
    category: { name: "Hogar", slug: "hogar" },
    brands: [
      { name: "Lumen", slug: "lumen" },
      { name: "Atelier", slug: "atelier" },
      { name: "Luma", slug: "luma" },
    ],
    images: [
      IMAGE_URL,
      IMAGE_URL,
      "/catalog/escritorio-luma-compacto.png",
      "/catalog/escritorio-luma-compacto.png",
      IMAGE_URL,
    ],
    variantField: "color",
    variantOptions: ["Roble claro", "Nogal", "Negro"],
    priceStep: 150,
    products: [
      { slug: "lampara-lumen-arco", name: "Lámpara Lumen de arco", description: "Lámpara de piso con pantalla orientable para iluminar salas y rincones de lectura.", tags: ["Iluminación", "Piso", "Sala"], basePrice: 2_299 },
      { slug: "silla-atelier-nordica", name: "Silla Atelier nórdica", description: "Silla de acento con asiento amplio y patas de madera para comedor o estudio.", tags: ["Silla", "Comedor", "Madera"], basePrice: 3_499 },
      { slug: "mesa-lateral-luma", name: "Mesa lateral Luma", description: "Mesa auxiliar compacta con superficie resistente y espacio inferior de guardado.", tags: ["Mesa", "Sala", "Almacenamiento"], basePrice: 1_899 },
      { slug: "librero-luma-modular", name: "Librero Luma modular", description: "Librero de cuatro niveles para organizar libros y objetos decorativos.", tags: ["Librero", "Organización", "Hogar"], basePrice: 2_799 },
      { slug: "banco-atelier-acento", name: "Banco Atelier de acento", description: "Banco bajo tapizado que funciona como asiento auxiliar o pie de cama.", tags: ["Banco", "Tapizado", "Recámara"], basePrice: 1_699 },
    ],
  },
  {
    category: { name: "Moda", slug: "moda" },
    brands: [
      { name: "Aural", slug: "aural" },
      { name: "Boreal", slug: "boreal" },
      { name: "Terral", slug: "terral" },
      { name: "Brisa", slug: "brisa" },
    ],
    images: [
      "/catalog/camisa-aural-relajada.png",
      "/catalog/sudadera-boreal-capucha.png",
      "/catalog/pantalon-terral-cargo.png",
      "/catalog/chamarra-brisa-cortaviento.png",
      "/catalog/camisa-aural-relajada.png",
    ],
    variantField: "size",
    variantOptions: ["CH", "M", "G", "EG"],
    priceStep: 90,
    products: [
      { slug: "camisa-aural-oxford", name: "Camisa Aural Oxford", description: "Camisa de algodón con cuello clásico y corte cómodo para uso diario.", tags: ["Camisa", "Algodón", "Casual"], basePrice: 999 },
      { slug: "sudadera-boreal-ligera", name: "Sudadera Boreal ligera", description: "Sudadera de felpa ligera con cuello redondo y puños acanalados.", tags: ["Sudadera", "Felpa", "Unisex"], basePrice: 899 },
      { slug: "pantalon-terral-chino", name: "Pantalón Terral chino", description: "Pantalón de corte recto con tejido flexible para oficina o fin de semana.", tags: ["Pantalón", "Corte recto", "Casual"], basePrice: 1_199 },
      { slug: "chamarra-brisa-urbana", name: "Chamarra Brisa urbana", description: "Chamarra ligera con cierre frontal, bolsillos laterales y cuello alto.", tags: ["Chamarra", "Urbana", "Ligera"], basePrice: 1_699 },
      { slug: "camisa-aural-lino", name: "Camisa Aural de lino", description: "Camisa fresca de mezcla de lino con manga larga y textura natural.", tags: ["Camisa", "Lino", "Verano"], basePrice: 1_299 },
    ],
  },
  {
    category: { name: "Deportes", slug: "deportes" },
    brands: [
      { name: "Kinetic", slug: "kinetic" },
      { name: "Vertex", slug: "vertex" },
      { name: "Brisa", slug: "brisa" },
      { name: "Vento", slug: "vento" },
    ],
    images: [
      "/catalog/chamarra-brisa-cortaviento.png",
      "/catalog/camisa-aural-relajada.png",
      "/catalog/pantalon-terral-cargo.png",
      "/catalog/mochila-vento-urbana.png",
      IMAGE_URL,
    ],
    variantField: "color",
    variantOptions: ["Negro", "Azul petróleo", "Verde pino"],
    priceStep: 110,
    products: [
      { slug: "chamarra-brisa-trail", name: "Chamarra Brisa Trail", description: "Capa ligera con tejido repelente al agua para caminatas y entrenamiento al aire libre.", tags: ["Exterior", "Repelente al agua", "Deporte"], basePrice: 2_099 },
      { slug: "playera-kinetic-dryfit", name: "Playera Kinetic DryFit", description: "Playera deportiva de secado rápido con paneles transpirables.", tags: ["Entrenamiento", "Secado rápido", "Deporte"], basePrice: 699 },
      { slug: "pantalon-kinetic-entrenamiento", name: "Pantalón Kinetic de entrenamiento", description: "Pantalón flexible con cintura ajustable y bolsillos con cierre.", tags: ["Entrenamiento", "Flexible", "Bolsillos"], basePrice: 1_099 },
      { slug: "mochila-vento-sport", name: "Mochila Vento Sport", description: "Mochila deportiva con compartimento para calzado y bolsa para botella.", tags: ["Mochila", "Gimnasio", "Deporte"], basePrice: 1_399 },
      { slug: "tenis-kinetic-trail", name: "Tenis Kinetic Trail", description: "Calzado con suela de tracción y soporte para recorridos en terreno mixto.", tags: ["Trail", "Tracción", "Running"], basePrice: 2_399 },
    ],
  },
  {
    category: { name: "Electrónica", slug: "electronica" },
    brands: [
      { name: "Aurora", slug: "aurora" },
      { name: "Nova", slug: "nova" },
      { name: "Prisma", slug: "prisma" },
    ],
    images: [
      IMAGE_URL,
      IMAGE_URL,
      "/catalog/camara-prisma-instantanea.png",
      IMAGE_URL,
      "/catalog/camara-prisma-instantanea.png",
    ],
    variantField: "color",
    variantOptions: ["Negro", "Plata", "Azul"],
    priceStep: 180,
    products: [
      { slug: "smart-tv-aurora-65", name: "Smart TV Aurora 65\" 4K", description: "Pantalla 4K de gran formato con HDR y acceso integrado a plataformas de video.", tags: ["4K", "HDR", "65 pulgadas"], basePrice: 19_999 },
      { slug: "audifonos-nova-sport", name: "Audífonos Nova Sport", description: "Audífonos inalámbricos resistentes al sudor con controles táctiles.", tags: ["Bluetooth", "Deporte", "Audio"], basePrice: 1_999 },
      { slug: "camara-prisma-compacta", name: "Cámara Prisma compacta", description: "Cámara digital portátil con zoom óptico y pantalla abatible.", tags: ["Fotografía", "Zoom", "Digital"], basePrice: 5_499 },
      { slug: "bocina-nova-pulse", name: "Bocina Nova Pulse", description: "Bocina Bluetooth portátil con sonido estéreo y batería recargable.", tags: ["Bluetooth", "Portátil", "Audio"], basePrice: 1_299 },
      { slug: "webcam-prisma-studio", name: "Webcam Prisma Studio", description: "Cámara web Full HD con micrófono integrado para videollamadas y streaming.", tags: ["Full HD", "Videollamadas", "USB"], basePrice: 1_099 },
    ],
  },
  {
    category: { name: "Viajes", slug: "viajes" },
    brands: [
      { name: "Vento", slug: "vento" },
      { name: "Nomad", slug: "nomad" },
    ],
    images: [
      "/catalog/mochila-vento-urbana.png",
      "/catalog/maleta-nomad-cabina.png",
      "/catalog/mochila-vento-urbana.png",
      "/catalog/maleta-nomad-cabina.png",
      "/catalog/maleta-nomad-cabina.png",
    ],
    variantField: "color",
    variantOptions: ["Grafito", "Terracota", "Azul marino"],
    priceStep: 160,
    products: [
      { slug: "mochila-vento-explorer", name: "Mochila Vento Explorer", description: "Mochila de viaje con compartimento acolchado y respaldo ventilado.", tags: ["Viaje", "Equipaje", "Acolchada"], basePrice: 2_199 },
      { slug: "maleta-nomad-mediana", name: "Maleta Nomad mediana", description: "Maleta rígida con cuatro ruedas dobles, candado integrado y expansión lateral.", tags: ["Maleta", "Ruedas", "Equipaje"], basePrice: 4_299 },
      { slug: "bolsa-vento-fin-semana", name: "Bolsa Vento de fin de semana", description: "Bolsa amplia con correa desmontable y compartimento independiente para calzado.", tags: ["Bolsa", "Viaje", "Fin de semana"], basePrice: 1_499 },
      { slug: "maleta-nomad-grande", name: "Maleta Nomad grande", description: "Maleta de gran capacidad con interior dividido y asa telescópica reforzada.", tags: ["Maleta", "Gran capacidad", "Ruedas"], basePrice: 5_299 },
      { slug: "neceser-nomad-organizador", name: "Neceser Nomad organizador", description: "Estuche de viaje con varios compartimentos y gancho para colgar.", tags: ["Neceser", "Organización", "Viaje"], basePrice: 599 },
    ],
  },
  {
    category: { name: "Belleza", slug: "belleza" },
    brands: [{ name: "Clara", slug: "clara" }],
    images: [
      "/catalog/serum-clara-hidratante.png",
      "/catalog/serum-clara-hidratante.png",
      "/catalog/serum-clara-hidratante.png",
      "/catalog/serum-clara-hidratante.png",
      "/catalog/serum-clara-hidratante.png",
    ],
    variantField: "size",
    variantOptions: ["30 ml", "50 ml", "100 ml"],
    priceStep: 70,
    products: [
      { slug: "crema-clara-hidratacion", name: "Crema Clara de hidratación", description: "Crema facial de textura ligera para uso diario y piel sensible.", tags: ["Cuidado facial", "Hidratación", "Piel sensible"], basePrice: 449 },
      { slug: "serum-clara-vitamina-c", name: "Sérum Clara con vitamina C", description: "Sérum antioxidante con gotero para integrar a la rutina de mañana.", tags: ["Sérum", "Vitamina C", "Cuidado facial"], basePrice: 629 },
      { slug: "contorno-clara-ojos", name: "Contorno Clara para ojos", description: "Fórmula de aplicación precisa para el cuidado diario del contorno de ojos.", tags: ["Contorno de ojos", "Cuidado facial", "Rutina"], basePrice: 519 },
      { slug: "limpiador-clara-suave", name: "Limpiador Clara suave", description: "Limpiador facial de uso diario que retira impurezas sin resecar la piel.", tags: ["Limpiador", "Facial", "Uso diario"], basePrice: 389 },
      { slug: "protector-clara-diario", name: "Protector Clara diario", description: "Protector facial ligero para acompañar la rutina diaria de cuidado de la piel.", tags: ["Protección", "Facial", "Uso diario"], basePrice: 579 },
    ],
  },
  {
    category: { name: "Oficina", slug: "oficina" },
    brands: [
      { name: "Luma", slug: "luma" },
      { name: "Atelier", slug: "atelier" },
      { name: "Lumen", slug: "lumen" },
    ],
    images: [
      "/catalog/escritorio-luma-compacto.png",
      "/catalog/escritorio-luma-compacto.png",
      "/catalog/escritorio-luma-compacto.png",
      IMAGE_URL,
      IMAGE_URL,
    ],
    variantField: "color",
    variantOptions: ["Roble claro", "Blanco", "Grafito"],
    priceStep: 130,
    products: [
      { slug: "escritorio-luma-esencial", name: "Escritorio Luma Esencial", description: "Escritorio de líneas sencillas con superficie amplia para trabajar desde casa.", tags: ["Escritorio", "Home office", "Madera"], basePrice: 3_999 },
      { slug: "soporte-luma-monitor", name: "Soporte Luma para monitor", description: "Base elevada para monitor con espacio inferior para teclado y accesorios.", tags: ["Monitor", "Ergonomía", "Organización"], basePrice: 899 },
      { slug: "organizador-luma-escritorio", name: "Organizador Luma de escritorio", description: "Organizador modular para papelería, libretas y accesorios de trabajo.", tags: ["Organizador", "Papelería", "Oficina"], basePrice: 499 },
      { slug: "lampara-lumen-escritorio", name: "Lámpara Lumen de escritorio", description: "Lámpara de lectura con brazo ajustable e iluminación dirigida.", tags: ["Lámpara", "Lectura", "Escritorio"], basePrice: 1_199 },
      { slug: "silla-atelier-ergonomica", name: "Silla Atelier ergonómica", description: "Silla ajustable con soporte lumbar y respaldo de malla transpirable.", tags: ["Silla", "Ergonomía", "Oficina"], basePrice: 4_999 },
    ],
  },
  {
    category: { name: "Juguetes", slug: "juguetes" },
    brands: [{ name: "Tilo", slug: "tilo" }],
    images: [
      "/catalog/bloques-tilo-madera.png",
      "/catalog/bloques-tilo-madera.png",
      "/catalog/bloques-tilo-madera.png",
      "/catalog/bloques-tilo-madera.png",
      "/catalog/bloques-tilo-madera.png",
    ],
    variantField: "size",
    variantOptions: ["24 piezas", "48 piezas", "72 piezas"],
    priceStep: 120,
    products: [
      { slug: "set-bloques-tilo-construccion", name: "Set de bloques Tilo de construcción", description: "Piezas de madera con formas variadas para construir figuras y estructuras.", tags: ["Construcción", "Madera", "Creatividad"], basePrice: 699 },
      { slug: "tren-tilo-madera", name: "Tren Tilo de madera", description: "Tren de arrastre con vagones acoplables y acabado de pintura al agua.", tags: ["Tren", "Madera", "Juego"], basePrice: 549 },
      { slug: "rompecabezas-tilo-bosque", name: "Rompecabezas Tilo del bosque", description: "Rompecabezas ilustrado con piezas resistentes para armar en familia.", tags: ["Rompecabezas", "Ilustrado", "Familia"], basePrice: 399 },
      { slug: "kit-tilo-equilibrio", name: "Kit Tilo de equilibrio", description: "Juego de piezas apilables para practicar equilibrio y coordinación.", tags: ["Equilibrio", "Coordinación", "Madera"], basePrice: 599 },
      { slug: "cubos-tilo-aprendizaje", name: "Cubos Tilo de aprendizaje", description: "Cubos de madera con letras, números y símbolos para aprender jugando.", tags: ["Aprendizaje", "Letras", "Números"], basePrice: 449 },
    ],
  },
  {
    category: { name: "Mascotas", slug: "mascotas" },
    brands: [{ name: "Nido", slug: "nido" }],
    images: [
      "/catalog/cama-nido-mascotas.png",
      "/catalog/cama-nido-mascotas.png",
      "/catalog/cama-nido-mascotas.png",
      "/catalog/cama-nido-mascotas.png",
      "/catalog/cama-nido-mascotas.png",
    ],
    variantField: "size",
    variantOptions: ["Chica", "Mediana", "Grande"],
    priceStep: 240,
    products: [
      { slug: "cama-nido-ortopedica", name: "Cama Nido ortopédica", description: "Cama acolchada con base de soporte y funda removible para limpieza.", tags: ["Mascotas", "Ortopédica", "Lavable"], basePrice: 1_499 },
      { slug: "manta-nido-suave", name: "Manta Nido suave", description: "Manta ligera de textura suave para camas, transportadoras y sillones.", tags: ["Mascotas", "Manta", "Suave"], basePrice: 399 },
      { slug: "colchoneta-nido-viaje", name: "Colchoneta Nido de viaje", description: "Colchoneta plegable para acompañar a las mascotas durante sus viajes.", tags: ["Mascotas", "Viaje", "Plegable"], basePrice: 649 },
      { slug: "cojin-nido-reversible", name: "Cojín Nido reversible", description: "Cojín reversible con dos texturas y relleno de recuperación rápida.", tags: ["Mascotas", "Cojín", "Reversible"], basePrice: 599 },
      { slug: "cama-nido-redonda", name: "Cama Nido redonda", description: "Cama circular con bordes elevados para descanso y sensación de abrigo.", tags: ["Mascotas", "Cama", "Descanso"], basePrice: 999 },
    ],
  },
  {
    category: { name: "Jardín", slug: "jardin" },
    brands: [
      { name: "Oliva", slug: "oliva" },
      { name: "Luma", slug: "luma" },
      { name: "Vento", slug: "vento" },
    ],
    images: [
      "/catalog/mandil-oliva-cocina.png",
      "/catalog/mandil-oliva-cocina.png",
      "/catalog/mandil-oliva-cocina.png",
      "/catalog/escritorio-luma-compacto.png",
      "/catalog/mandil-oliva-cocina.png",
    ],
    variantField: "color",
    variantOptions: ["Verde", "Terracota", "Grafito"],
    priceStep: 60,
    products: [
      { slug: "mandil-oliva-jardin", name: "Mandil Oliva de jardín", description: "Mandil resistente con bolsillos para semillas, guantes y herramientas pequeñas.", tags: ["Jardín", "Mandil", "Herramientas"], basePrice: 599 },
      { slug: "guantes-oliva-jardin", name: "Guantes Oliva de jardinería", description: "Guantes flexibles con palma reforzada para labores de plantación y poda.", tags: ["Jardín", "Guantes", "Protección"], basePrice: 249 },
      { slug: "set-herramientas-oliva-jardin", name: "Set Oliva de herramientas de jardín", description: "Set manual con pala, cultivador y tijeras para el cuidado de macetas.", tags: ["Jardín", "Herramientas", "Cultivo"], basePrice: 699 },
      { slug: "maceta-luma-autorriego", name: "Maceta Luma de autorriego", description: "Maceta con depósito inferior que ayuda a mantener la humedad de las plantas.", tags: ["Maceta", "Autorriego", "Plantas"], basePrice: 399 },
      { slug: "regadera-oliva-metal", name: "Regadera Oliva de metal", description: "Regadera metálica de pico largo para plantas de interior y exterior.", tags: ["Jardín", "Regadera", "Metal"], basePrice: 499 },
    ],
  },
  {
    category: { name: "Accesorios", slug: "accesorios" },
    brands: [
      { name: "Vertex", slug: "vertex" },
      { name: "Nova", slug: "nova" },
      { name: "Prisma", slug: "prisma" },
      { name: "Vento", slug: "vento" },
      { name: "Nomad", slug: "nomad" },
    ],
    images: [
      IMAGE_URL,
      IMAGE_URL,
      "/catalog/camara-prisma-instantanea.png",
      "/catalog/mochila-vento-urbana.png",
      "/catalog/maleta-nomad-cabina.png",
    ],
    variantField: "color",
    variantOptions: ["Negro", "Azul", "Arena"],
    priceStep: 90,
    products: [
      { slug: "reloj-vertex-active", name: "Reloj Vertex Active", description: "Reloj inteligente con seguimiento de actividad, sueño y notificaciones.", tags: ["Smartwatch", "Actividad", "Bluetooth"], basePrice: 2_999 },
      { slug: "audifonos-nova-viaje", name: "Audífonos Nova de viaje", description: "Audífonos plegables con almohadillas suaves y micrófono integrado.", tags: ["Audio", "Viaje", "Plegables"], basePrice: 1_699 },
      { slug: "funda-prisma-camara", name: "Funda Prisma para cámara", description: "Funda acolchada con correa ajustable para proteger cámaras compactas.", tags: ["Fotografía", "Funda", "Protección"], basePrice: 499 },
      { slug: "mochila-vento-compacta", name: "Mochila Vento compacta", description: "Mochila ligera con compartimento para tableta y bolsillos de acceso rápido.", tags: ["Mochila", "Tableta", "Urbana"], basePrice: 1_199 },
      { slug: "bolsa-nomad-accesorios", name: "Bolsa Nomad para accesorios", description: "Organizador de viaje con divisores para cables, cargadores y artículos personales.", tags: ["Viaje", "Organizador", "Accesorios"], basePrice: 449 },
    ],
  },
];

let nextExpandedProductNumber = products.length + 1;
const expandedProducts: SeedProduct[] = expandedProductGroups.flatMap((group) =>
  group.products.map((product, groupIndex) => {
    const productNumber = nextExpandedProductNumber++;
    const brand = group.brands[groupIndex % group.brands.length]!;
    const variants = group.variantOptions.map((option, variantIndex) => ({
      id: `a2000000-0000-4000-8000-${String(productNumber * 100 + variantIndex + 1).padStart(12, "0")}`,
      sku: `DEMO-${String(productNumber).padStart(3, "0")}-${String(variantIndex + 1).padStart(2, "0")}`,
      [group.variantField]: option,
      listPrice: product.basePrice + variantIndex * group.priceStep,
    } as SeedVariant));

    return {
      id: `a1000000-0000-4000-8000-${String(productNumber).padStart(12, "0")}`,
      slug: product.slug,
      name: product.name,
      description: product.description,
      category: group.category,
      brand,
      tags: product.tags,
      imageUrl: group.images[groupIndex % group.images.length]!,
      variants,
    };
  }),
);

interface AdditionalProductSpec {
  slug: string;
  name: string;
  description: string;
  type: string;
  tags: string[];
  basePrice: number;
}

interface AdditionalProductGroup {
  category: SeedProduct["category"];
  brands: readonly [SeedProduct["brand"], ...SeedProduct["brand"][]];
  images: readonly [string, ...string[]];
  variantField: "color" | "size";
  variantOptions: readonly [string, ...string[]];
  priceStep: number;
  products: AdditionalProductSpec[];
}

const additionalProductGroups: AdditionalProductGroup[] = [
  {
    category: { name: "Cocina", slug: "cocina" },
    brands: [
      { name: "Cobalto", slug: "cobalto" },
      { name: "Fuego", slug: "fuego" },
      { name: "Aliso", slug: "aliso" },
    ],
    images: [
      "/catalog/cafetera-bruma-espresso.png",
      "/catalog/licuadora-nara-personal.png",
      "/catalog/mandil-oliva-cocina.png",
    ],
    variantField: "color",
    variantOptions: ["Marfil", "Negro", "Acero", "Verde salvia"],
    priceStep: 75,
    products: [
      { slug: "freidora-cobalto-aire", name: "Freidora de aire de 5 litros", description: "Freidora de aire con canastilla antiadherente y programas para cocinar distintos alimentos.", type: "Freidora de aire", tags: ["Cocina", "5 litros", "Antiadherente"], basePrice: 2_499 },
      { slug: "sarten-fuego-ceramico", name: "Sartén cerámico de 28 cm", description: "Sartén amplio con recubrimiento cerámico y mango de agarre frío.", type: "Sartén", tags: ["Cerámico", "28 cm", "Utensilios"], basePrice: 799 },
      { slug: "cuchillos-aliso-chef", name: "Set de cuchillos de chef", description: "Juego de cuchillos de acero con bloque compacto para mantenerlos organizados.", type: "Cuchillos", tags: ["Acero", "Set", "Preparación"], basePrice: 1_399 },
      { slug: "bascula-cobalto-digital", name: "Báscula digital de cocina", description: "Báscula compacta con pantalla fácil de leer y función de tara para recetas.", type: "Báscula", tags: ["Digital", "Recetas", "Precisión"], basePrice: 429 },
      { slug: "olla-fuego-presion", name: "Olla de presión de 6 litros", description: "Olla de presión con válvula de seguridad y asas resistentes al calor.", type: "Olla de presión", tags: ["6 litros", "Seguridad", "Acero"], basePrice: 1_899 },
      { slug: "contenedores-aliso-vidrio", name: "Juego de contenedores de vidrio", description: "Recipientes apilables con tapas herméticas para guardar y transportar alimentos.", type: "Contenedores", tags: ["Vidrio", "Hermético", "Almacenamiento"], basePrice: 699 },
      { slug: "batidora-cobalto-pedestal", name: "Batidora de pedestal compacta", description: "Batidora con tazón de acero y velocidades para masas, cremas y mezclas.", type: "Batidora", tags: ["Repostería", "Acero", "Velocidades"], basePrice: 2_799 },
      { slug: "exprimidor-fuego-citrico", name: "Exprimidor eléctrico de cítricos", description: "Exprimidor con cono reversible y depósito desmontable para servir fácilmente.", type: "Exprimidor", tags: ["Cítricos", "Eléctrico", "Desayuno"], basePrice: 649 },
      { slug: "tabla-aliso-bambu", name: "Tabla de corte de bambú", description: "Tabla reversible con canal para líquidos y superficie amplia de corte.", type: "Tabla de corte", tags: ["Bambú", "Reversible", "Preparación"], basePrice: 499 },
      { slug: "dispensador-cobalto-aceite", name: "Dispensador de aceite medidor", description: "Botella dosificadora de vidrio con pico antigoteo para aceite y vinagre.", type: "Dispensador", tags: ["Vidrio", "Dosificador", "Mesa"], basePrice: 329 },
    ],
  },
  {
    category: { name: "Hogar", slug: "hogar" },
    brands: [
      { name: "Casa Nativa", slug: "casa-nativa" },
      { name: "Roble", slug: "roble" },
      { name: "Nébula", slug: "nebula" },
    ],
    images: [
      "/catalog/escritorio-luma-compacto.png",
      IMAGE_URL,
      "/catalog/cafetera-bruma-espresso.png",
    ],
    variantField: "color",
    variantOptions: ["Roble claro", "Nogal", "Blanco", "Grafito"],
    priceStep: 140,
    products: [
      { slug: "cojines-casa-nativa-lino", name: "Cojines decorativos de lino", description: "Par de fundas de lino con cierre oculto para renovar sillones y camas.", type: "Cojines", tags: ["Lino", "Decoración", "Sala"], basePrice: 699 },
      { slug: "reloj-roble-pared", name: "Reloj minimalista de pared", description: "Reloj silencioso con carátula clara y mecanismo de barrido continuo.", type: "Reloj de pared", tags: ["Decoración", "Silencioso", "Minimalista"], basePrice: 899 },
      { slug: "difusor-nebula-aromas", name: "Difusor ultrasónico de aromas", description: "Difusor con temporizador y luz ambiental para habitaciones y áreas de descanso.", type: "Difusor", tags: ["Aromaterapia", "Temporizador", "Luz"], basePrice: 1_099 },
      { slug: "cobija-casa-nativa-tejida", name: "Cobija tejida para sofá", description: "Cobija ligera de tejido suave con flecos para usar en sala o recámara.", type: "Cobija", tags: ["Textil", "Suave", "Sala"], basePrice: 849 },
      { slug: "espejo-roble-vertical", name: "Espejo vertical de cuerpo completo", description: "Espejo alto con marco delgado y soporte para colocarlo de pie o en pared.", type: "Espejo", tags: ["Recámara", "Marco", "Decoración"], basePrice: 2_199 },
      { slug: "organizador-nebula-cestas", name: "Juego de cestas organizadoras", description: "Cestas de fibras tejidas para ordenar mantas, juguetes y accesorios del hogar.", type: "Cestas", tags: ["Organización", "Fibras", "Almacenamiento"], basePrice: 1_299 },
      { slug: "cortinas-casa-nativa-blackout", name: "Cortinas blackout para recámara", description: "Par de cortinas opacas con ojillos para reducir la entrada de luz exterior.", type: "Cortinas", tags: ["Blackout", "Ventana", "Recámara"], basePrice: 1_499 },
      { slug: "tapete-roble-geometrico", name: "Tapete geométrico de sala", description: "Tapete de tejido resistente con patrón geométrico para áreas de convivencia.", type: "Tapete", tags: ["Sala", "Tejido", "Geométrico"], basePrice: 2_499 },
      { slug: "portavelas-nebula-ceramica", name: "Portavelas de cerámica", description: "Set de portavelas decorativos con base estable y acabado esmaltado.", type: "Portavelas", tags: ["Cerámica", "Decoración", "Set"], basePrice: 579 },
      { slug: "cesto-ropa-casa-nativa", name: "Cesto plegable para ropa", description: "Cesto ventilado con asas laterales y estructura plegable para ahorrar espacio.", type: "Cesto de ropa", tags: ["Lavandería", "Plegable", "Organización"], basePrice: 749 },
    ],
  },
  {
    category: { name: "Moda", slug: "moda" },
    brands: [
      { name: "Cierzo", slug: "cierzo" },
      { name: "Nácar", slug: "nacar" },
      { name: "Litoral", slug: "litoral" },
    ],
    images: [
      "/catalog/camisa-aural-relajada.png",
      "/catalog/sudadera-boreal-capucha.png",
      "/catalog/pantalon-terral-cargo.png",
      "/catalog/chamarra-brisa-cortaviento.png",
    ],
    variantField: "size",
    variantOptions: ["CH", "M", "G", "EG"],
    priceStep: 95,
    products: [
      { slug: "camiseta-cierzo-basica", name: "Camiseta de algodón básica", description: "Camiseta de algodón peinado con cuello reforzado y corte recto.", type: "Camiseta", tags: ["Algodón", "Básico", "Casual"], basePrice: 399 },
      { slug: "falda-nacar-midi", name: "Falda midi plisada", description: "Falda de largo midi con cintura elástica y pliegues de caída ligera.", type: "Falda", tags: ["Midi", "Plisada", "Casual"], basePrice: 899 },
      { slug: "vestido-litoral-cruzado", name: "Vestido cruzado de manga corta", description: "Vestido con cintura ajustable y tela ligera para uso diario.", type: "Vestido", tags: ["Manga corta", "Ligero", "Diario"], basePrice: 1_199 },
      { slug: "sueter-cierzo-cuello-alto", name: "Suéter de punto con cuello alto", description: "Suéter de punto medio con puños acanalados y cuello alto.", type: "Suéter", tags: ["Punto", "Temporada fría", "Tejido"], basePrice: 1_399 },
      { slug: "short-nacar-lino", name: "Short de lino con cintura ajustable", description: "Short fresco con bolsillos laterales y cordón interior en la cintura.", type: "Short", tags: ["Lino", "Verano", "Bolsillos"], basePrice: 749 },
      { slug: "blusa-litoral-manga", name: "Blusa ligera de manga larga", description: "Blusa de tela fluida con puños sencillos y cuello camisero.", type: "Blusa", tags: ["Ligera", "Manga larga", "Oficina"], basePrice: 999 },
      { slug: "chaleco-cierzo-acolchado", name: "Chaleco acolchado ligero", description: "Chaleco con cierre frontal y bolsillos para llevar como capa intermedia.", type: "Chaleco", tags: ["Acolchado", "Ligero", "Exterior"], basePrice: 1_499 },
      { slug: "jeans-nacar-rectos", name: "Jeans de corte recto", description: "Pantalón de mezclilla de tiro medio con cinco bolsillos clásicos.", type: "Jeans", tags: ["Mezclilla", "Corte recto", "Diario"], basePrice: 1_099 },
      { slug: "pijama-litoral-algodon", name: "Pijama de algodón de dos piezas", description: "Conjunto de playera y pantalón ligero con cintura elástica.", type: "Pijama", tags: ["Algodón", "Descanso", "Dos piezas"], basePrice: 1_199 },
      { slug: "impermeable-cierzo-compacto", name: "Impermeable compacto con capucha", description: "Chamarra impermeable plegable con capucha ajustable y costuras selladas.", type: "Impermeable", tags: ["Lluvia", "Plegable", "Capucha"], basePrice: 1_799 },
    ],
  },
  {
    category: { name: "Deportes", slug: "deportes" },
    brands: [
      { name: "Pionero", slug: "pionero" },
      { name: "Cima", slug: "cima" },
      { name: "Kinetic", slug: "kinetic" },
    ],
    images: [
      "/catalog/chamarra-brisa-cortaviento.png",
      "/catalog/camisa-aural-relajada.png",
      "/catalog/mochila-vento-urbana.png",
    ],
    variantField: "color",
    variantOptions: ["Negro", "Azul", "Verde", "Naranja"],
    priceStep: 85,
    products: [
      { slug: "tapete-pionero-yoga", name: "Tapete de yoga antideslizante", description: "Tapete acolchado con superficie texturizada y correa para transportarlo.", type: "Tapete de yoga", tags: ["Yoga", "Antideslizante", "Entrenamiento"], basePrice: 799 },
      { slug: "mancuernas-cima-ajustables", name: "Par de mancuernas ajustables", description: "Mancuernas con discos intercambiables y seguros para entrenamiento en casa.", type: "Mancuernas", tags: ["Fuerza", "Ajustables", "Casa"], basePrice: 1_899 },
      { slug: "rodillo-pionero-recuperacion", name: "Rodillo de espuma para recuperación", description: "Rodillo firme con relieve para rutinas de movilidad y recuperación muscular.", type: "Rodillo", tags: ["Movilidad", "Recuperación", "Espuma"], basePrice: 499 },
      { slug: "balon-cima-futbol", name: "Balón de fútbol de entrenamiento", description: "Balón cosido con cubierta resistente para sesiones de práctica en campo.", type: "Balón de fútbol", tags: ["Fútbol", "Entrenamiento", "Exterior"], basePrice: 699 },
      { slug: "cuerda-pionero-salto", name: "Cuerda de salto con rodamientos", description: "Cuerda ajustable con mangos ergonómicos para rutinas de cardio.", type: "Cuerda para saltar", tags: ["Cardio", "Ajustable", "Agilidad"], basePrice: 349 },
      { slug: "guantes-cima-ciclismo", name: "Guantes acolchados de ciclismo", description: "Guantes con palma ventilada y ajuste de velcro para recorridos en bicicleta.", type: "Guantes de ciclismo", tags: ["Ciclismo", "Ventilación", "Acolchado"], basePrice: 599 },
      { slug: "botella-pionero-deportiva", name: "Botella deportiva de acero", description: "Botella térmica con tapa de rosca y asa para llevar a entrenamientos.", type: "Botella deportiva", tags: ["Acero", "Térmica", "Hidratación"], basePrice: 449 },
      { slug: "balon-cima-baloncesto", name: "Balón de baloncesto para interior y exterior", description: "Balón con canales de agarre para juego recreativo en distintas superficies.", type: "Balón de baloncesto", tags: ["Baloncesto", "Agarre", "Recreativo"], basePrice: 749 },
      { slug: "banda-pionero-resistencia", name: "Set de bandas de resistencia", description: "Bandas de distintas tensiones con bolsa de guardado para ejercicio funcional.", type: "Bandas de resistencia", tags: ["Funcional", "Fuerza", "Set"], basePrice: 399 },
      { slug: "rodilleras-cima-entrenamiento", name: "Rodilleras de soporte deportivo", description: "Rodilleras elásticas con tejido transpirable para entrenamientos y caminatas.", type: "Rodilleras", tags: ["Soporte", "Transpirable", "Deporte"], basePrice: 549 },
    ],
  },
  {
    category: { name: "Electrónica", slug: "electronica" },
    brands: [
      { name: "Voltio", slug: "voltio" },
      { name: "Sonora", slug: "sonora" },
      { name: "Órbita", slug: "orbita" },
    ],
    images: [IMAGE_URL, "/catalog/camara-prisma-instantanea.png"],
    variantField: "color",
    variantOptions: ["Negro", "Plata", "Azul", "Blanco"],
    priceStep: 125,
    products: [
      { slug: "router-voltio-wifi6", name: "Router de doble banda Wi-Fi 6", description: "Router de doble banda con cuatro antenas y controles de red desde la aplicación.", type: "Router", tags: ["Wi-Fi 6", "Red", "Doble banda"], basePrice: 1_699 },
      { slug: "teclado-sonora-mecanico", name: "Teclado mecánico compacto", description: "Teclado con interruptores táctiles, iluminación regulable y conexión USB.", type: "Teclado", tags: ["Mecánico", "USB", "Computación"], basePrice: 1_499 },
      { slug: "mouse-orbita-ergonomico", name: "Mouse inalámbrico ergonómico", description: "Mouse inalámbrico con sensor ajustable y forma cómoda para uso prolongado.", type: "Mouse", tags: ["Inalámbrico", "Ergonómico", "Computación"], basePrice: 799 },
      { slug: "bateria-voltio-portatil", name: "Batería portátil de 20 000 mAh", description: "Batería externa con dos puertos de salida y pantalla indicadora de carga.", type: "Batería portátil", tags: ["20 000 mAh", "USB", "Carga"], basePrice: 1_099 },
      { slug: "cargador-sonora-usbc", name: "Cargador rápido USB-C de 45 W", description: "Adaptador de pared compacto con protección contra sobrecarga y temperatura.", type: "Cargador", tags: ["USB-C", "45 W", "Carga rápida"], basePrice: 699 },
      { slug: "hub-orbita-usb", name: "Hub USB de cuatro puertos", description: "Concentrador USB compacto para conectar periféricos y unidades externas.", type: "Hub USB", tags: ["USB", "Conectividad", "Computación"], basePrice: 449 },
      { slug: "ssd-voltio-externo", name: "Unidad SSD externa de 1 TB", description: "Unidad de estado sólido portátil con conexión USB-C para respaldos y archivos.", type: "SSD externo", tags: ["1 TB", "Almacenamiento", "USB-C"], basePrice: 2_199 },
      { slug: "soporte-sonora-celular", name: "Soporte plegable para celular", description: "Base ajustable con ángulo regulable para videollamadas y reproducción de contenido.", type: "Soporte para celular", tags: ["Plegable", "Ajustable", "Accesorios"], basePrice: 299 },
      { slug: "microfono-orbita-usb", name: "Micrófono USB para streaming", description: "Micrófono de escritorio con control de ganancia y filtro para voz.", type: "Micrófono", tags: ["Streaming", "USB", "Audio"], basePrice: 1_799 },
      { slug: "lector-voltio-tarjetas", name: "Lector múltiple de tarjetas", description: "Lector USB para tarjetas SD y microSD con transferencia de archivos.", type: "Lector de tarjetas", tags: ["SD", "microSD", "USB"], basePrice: 349 },
    ],
  },
  {
    category: { name: "Viajes", slug: "viajes" },
    brands: [
      { name: "Ruta", slug: "ruta" },
      { name: "Atlas", slug: "atlas" },
      { name: "Nomad", slug: "nomad" },
    ],
    images: [
      "/catalog/mochila-vento-urbana.png",
      "/catalog/maleta-nomad-cabina.png",
    ],
    variantField: "color",
    variantOptions: ["Grafito", "Azul marino", "Oliva", "Arena"],
    priceStep: 135,
    products: [
      { slug: "portadocumentos-ruta-viaje", name: "Portadocumentos de viaje", description: "Organizador con espacios para pasaporte, tarjetas y documentos de embarque.", type: "Portadocumentos", tags: ["Pasaporte", "Organización", "Viaje"], basePrice: 499 },
      { slug: "etiquetas-atlas-equipaje", name: "Set de etiquetas para equipaje", description: "Etiquetas flexibles con espacio para datos de contacto y broche seguro.", type: "Etiquetas de equipaje", tags: ["Equipaje", "Identificación", "Set"], basePrice: 249 },
      { slug: "almohada-ruta-cuello", name: "Almohada cervical de viaje", description: "Almohada de soporte con funda lavable y broche para sujetarla al equipaje.", type: "Almohada cervical", tags: ["Descanso", "Viaje", "Lavable"], basePrice: 599 },
      { slug: "cubos-atlas-empaque", name: "Set de cubos organizadores", description: "Cubos de distintos tamaños con malla superior para ordenar ropa en la maleta.", type: "Cubos organizadores", tags: ["Empaque", "Organización", "Set"], basePrice: 699 },
      { slug: "bolsa-ruta-plegable", name: "Bolsa plegable de viaje", description: "Bolsa ligera que se guarda en su propio bolsillo y se abre para equipaje adicional.", type: "Bolsa plegable", tags: ["Ligera", "Equipaje", "Plegable"], basePrice: 399 },
      { slug: "neceser-atlas-colgante", name: "Neceser colgante impermeable", description: "Estuche de aseo con gancho superior y compartimentos internos con cierre.", type: "Neceser", tags: ["Aseo", "Impermeable", "Compartimentos"], basePrice: 749 },
      { slug: "candado-ruta-combinacion", name: "Candado TSA de combinación", description: "Candado compacto de combinación numérica para proteger maletas durante el viaje.", type: "Candado", tags: ["TSA", "Seguridad", "Maleta"], basePrice: 329 },
      { slug: "bascula-atlas-maleta", name: "Báscula digital para maleta", description: "Báscula de mano con pantalla iluminada para revisar el peso del equipaje.", type: "Báscula de equipaje", tags: ["Digital", "Equipaje", "Viaje"], basePrice: 349 },
      { slug: "mochila-ruta-hidratacion", name: "Mochila compacta de hidratación", description: "Mochila ligera con bolsa de hidratación y tirantes ajustables para excursiones.", type: "Mochila de hidratación", tags: ["Excursión", "Hidratación", "Ligera"], basePrice: 1_299 },
      { slug: "organizador-atlas-cables", name: "Estuche organizador de cables", description: "Estuche acolchado con bandas y bolsillos para cargadores, adaptadores y cables.", type: "Estuche para cables", tags: ["Accesorios", "Electrónica", "Organización"], basePrice: 449 },
    ],
  },
  {
    category: { name: "Belleza", slug: "belleza" },
    brands: [
      { name: "Selene", slug: "selene" },
      { name: "Aura", slug: "aura" },
      { name: "Clara", slug: "clara" },
    ],
    images: ["/catalog/serum-clara-hidratante.png"],
    variantField: "size",
    variantOptions: ["30 ml", "50 ml", "100 ml", "200 ml"],
    priceStep: 65,
    products: [
      { slug: "mascarilla-selene-cabello", name: "Mascarilla nutritiva para cabello", description: "Tratamiento capilar de enjuague para suavizar y desenredar el cabello.", type: "Mascarilla capilar", tags: ["Cabello", "Nutrición", "Enjuague"], basePrice: 399 },
      { slug: "protector-aura-solar", name: "Protector solar facial FPS 50", description: "Protector facial de textura ligera para incorporar a la rutina de día.", type: "Protector solar", tags: ["FPS 50", "Facial", "Rutina diaria"], basePrice: 529 },
      { slug: "limpiador-selene-espuma", name: "Espuma limpiadora facial", description: "Limpiador suave con dosificador para retirar residuos de la piel.", type: "Limpiador facial", tags: ["Limpieza", "Espuma", "Facial"], basePrice: 359 },
      { slug: "aceite-aura-facial", name: "Aceite facial de escualano", description: "Aceite ligero de aplicación nocturna con gotero dosificador.", type: "Aceite facial", tags: ["Escualano", "Noche", "Hidratación"], basePrice: 649 },
      { slug: "exfoliante-selene-corporal", name: "Exfoliante corporal de azúcar", description: "Exfoliante de textura granulada para usar durante la rutina de baño.", type: "Exfoliante corporal", tags: ["Cuidado corporal", "Baño", "Exfoliación"], basePrice: 429 },
      { slug: "tonico-aura-equilibrante", name: "Tónico facial equilibrante", description: "Tónico de uso diario con atomizador para refrescar la piel después de la limpieza.", type: "Tónico", tags: ["Facial", "Atomizador", "Uso diario"], basePrice: 389 },
      { slug: "balsamo-selene-labios", name: "Bálsamo reparador para labios", description: "Bálsamo compacto con acabado suave para el cuidado cotidiano de los labios.", type: "Bálsamo labial", tags: ["Labios", "Cuidado", "Compacto"], basePrice: 179 },
      { slug: "crema-aura-manos", name: "Crema humectante para manos", description: "Crema de rápida absorción en tubo portátil para usar durante el día.", type: "Crema de manos", tags: ["Humectante", "Portátil", "Cuidado corporal"], basePrice: 229 },
      { slug: "shampoo-selene-solido", name: "Shampoo sólido de uso diario", description: "Barra de limpieza capilar en estuche reutilizable para casa o viaje.", type: "Shampoo sólido", tags: ["Cabello", "Barra", "Estuche"], basePrice: 299 },
      { slug: "cepillo-aura-facial", name: "Cepillo facial de silicona", description: "Cepillo lavable de silicona con agarre ergonómico para limpieza del rostro.", type: "Cepillo facial", tags: ["Silicona", "Limpieza", "Lavable"], basePrice: 249 },
    ],
  },
  {
    category: { name: "Oficina", slug: "oficina" },
    brands: [
      { name: "Punto", slug: "punto" },
      { name: "Trama", slug: "trama" },
      { name: "Luma", slug: "luma" },
    ],
    images: ["/catalog/escritorio-luma-compacto.png", IMAGE_URL],
    variantField: "color",
    variantOptions: ["Negro", "Blanco", "Madera clara", "Azul"],
    priceStep: 90,
    products: [
      { slug: "cuaderno-punto-punteado", name: "Cuaderno punteado de pasta dura", description: "Cuaderno de hojas punteadas con separador y bolsillo interior.", type: "Cuaderno", tags: ["Papelería", "Punteado", "Pasta dura"], basePrice: 299 },
      { slug: "plumas-trama-gel", name: "Set de plumas de gel", description: "Plumas de tinta de gel con punta fina y cuerpo translúcido.", type: "Plumas", tags: ["Escritura", "Gel", "Set"], basePrice: 199 },
      { slug: "archivador-punto-acordeon", name: "Archivador expandible de acordeón", description: "Carpeta con separadores etiquetables y cierre elástico para documentos.", type: "Archivador", tags: ["Documentos", "Separadores", "Organización"], basePrice: 349 },
      { slug: "mousepad-trama-extendido", name: "Tapete extendido para escritorio", description: "Superficie amplia antideslizante para teclado y mouse con bordes cosidos.", type: "Tapete de escritorio", tags: ["Escritorio", "Antideslizante", "Computación"], basePrice: 499 },
      { slug: "perforadora-punto-metal", name: "Perforadora metálica de dos orificios", description: "Perforadora compacta con guía de papel y depósito removible.", type: "Perforadora", tags: ["Papelería", "Metal", "Documentos"], basePrice: 239 },
      { slug: "engrapadora-trama-escritorio", name: "Engrapadora de escritorio", description: "Engrapadora de base antideslizante con cargador superior de grapas.", type: "Engrapadora", tags: ["Papelería", "Escritorio", "Oficina"], basePrice: 189 },
      { slug: "lampara-punto-led", name: "Lámpara LED de lectura", description: "Lámpara de escritorio con brazo flexible y tres niveles de brillo.", type: "Lámpara de lectura", tags: ["LED", "Lectura", "Ajustable"], basePrice: 999 },
      { slug: "cajonera-trama-rodante", name: "Cajonera móvil de tres niveles", description: "Cajonera con ruedas y cajones de extracción para guardar documentos y útiles.", type: "Cajonera", tags: ["Almacenamiento", "Ruedas", "Oficina"], basePrice: 1_799 },
      { slug: "pizarron-punto-magnetico", name: "Pizarrón magnético de pared", description: "Pizarrón blanco con superficie borrable y accesorios de montaje.", type: "Pizarrón", tags: ["Planeación", "Magnético", "Pared"], basePrice: 699 },
      { slug: "reposapies-trama-ergonomico", name: "Reposapiés ergonómico ajustable", description: "Reposapiés con superficie texturizada y altura regulable para jornadas de trabajo.", type: "Reposapiés", tags: ["Ergonomía", "Ajustable", "Oficina"], basePrice: 899 },
    ],
  },
  {
    category: { name: "Juguetes", slug: "juguetes" },
    brands: [
      { name: "Caleido", slug: "caleido" },
      { name: "Ronda", slug: "ronda" },
      { name: "Tilo", slug: "tilo" },
    ],
    images: ["/catalog/bloques-tilo-madera.png"],
    variantField: "size",
    variantOptions: ["3+ años", "5+ años", "8+ años", "Familiar"],
    priceStep: 85,
    products: [
      { slug: "rompecabezas-caleido-oceano", name: "Rompecabezas ilustrado del océano", description: "Rompecabezas de piezas grandes con ilustración de fauna marina.", type: "Rompecabezas", tags: ["Océano", "Ilustrado", "Juego de mesa"], basePrice: 429 },
      { slug: "memorama-ronda-animales", name: "Memorama de animales", description: "Juego de memoria con tarjetas ilustradas y caja compacta para guardar.", type: "Memorama", tags: ["Memoria", "Animales", "Cartas"], basePrice: 249 },
      { slug: "kit-caleido-pintura", name: "Kit de pintura y dibujo", description: "Set de colores, pincel y cuaderno para actividades creativas en casa.", type: "Kit de arte", tags: ["Pintura", "Creatividad", "Dibujo"], basePrice: 499 },
      { slug: "juego-ronda-equilibrio", name: "Juego de equilibrio de piezas", description: "Juego de apilamiento con piezas de formas variadas para toda la familia.", type: "Juego de equilibrio", tags: ["Coordinación", "Apilamiento", "Familia"], basePrice: 399 },
      { slug: "marioneta-caleido-zorro", name: "Marioneta de mano de zorro", description: "Marioneta textil suave con detalles bordados para contar historias.", type: "Marioneta", tags: ["Teatro", "Textil", "Historias"], basePrice: 349 },
      { slug: "set-ronda-canicas", name: "Circuito de canicas modular", description: "Piezas encajables para diseñar recorridos y pendientes de canicas.", type: "Circuito", tags: ["Construcción", "Lógica", "Modular"], basePrice: 599 },
      { slug: "bloques-caleido-magneticos", name: "Bloques magnéticos de construcción", description: "Piezas magnéticas de colores para crear formas planas y estructuras.", type: "Bloques magnéticos", tags: ["Construcción", "Imanes", "Creatividad"], basePrice: 799 },
      { slug: "loteria-ronda-ilustrada", name: "Lotería ilustrada familiar", description: "Juego de lotería con tablero, cartas ilustradas y fichas reutilizables.", type: "Lotería", tags: ["Familia", "Cartas", "Tradicional"], basePrice: 279 },
      { slug: "kit-caleido-explorador", name: "Kit de explorador infantil", description: "Accesorios de observación y libreta para actividades de exploración al aire libre.", type: "Kit de exploración", tags: ["Aventura", "Exterior", "Observación"], basePrice: 649 },
      { slug: "peluche-ronda-nube", name: "Peluche suave con forma de nube", description: "Peluche ligero con tela corta y costuras reforzadas para acompañar el descanso.", type: "Peluche", tags: ["Suave", "Descanso", "Textil"], basePrice: 399 },
    ],
  },
  {
    category: { name: "Mascotas", slug: "mascotas" },
    brands: [
      { name: "Huella", slug: "huella" },
      { name: "Patitas", slug: "patitas" },
      { name: "Nido", slug: "nido" },
    ],
    images: ["/catalog/cama-nido-mascotas.png"],
    variantField: "size",
    variantOptions: ["Chica", "Mediana", "Grande", "Extra grande"],
    priceStep: 110,
    products: [
      { slug: "comedero-huella-acero", name: "Comedero de acero antideslizante", description: "Tazón de acero con base de silicona que ayuda a mantenerlo en su lugar.", type: "Comedero", tags: ["Acero", "Antideslizante", "Alimentación"], basePrice: 329 },
      { slug: "correa-patitas-reflectante", name: "Correa reflectante de paseo", description: "Correa con costuras reflectantes y asa acolchada para paseos cotidianos.", type: "Correa", tags: ["Paseo", "Reflectante", "Acolchada"], basePrice: 449 },
      { slug: "transportadora-huella-plegable", name: "Transportadora plegable", description: "Transportadora ventilada con entradas laterales y estructura plegable.", type: "Transportadora", tags: ["Viaje", "Ventilación", "Plegable"], basePrice: 1_499 },
      { slug: "juguete-patitas-cuerda", name: "Juguete de cuerda trenzada", description: "Juguete resistente de cuerda para juegos de interacción y mordida.", type: "Juguete de cuerda", tags: ["Juego", "Mordida", "Trenzado"], basePrice: 199 },
      { slug: "cepillo-huella-deslanador", name: "Cepillo deslanador con mango", description: "Cepillo de cuidado con mango ergonómico y botón para retirar el pelo acumulado.", type: "Cepillo", tags: ["Aseo", "Mango ergonómico", "Mascotas"], basePrice: 399 },
      { slug: "arnes-patitas-ajustable", name: "Arnés ajustable para paseo", description: "Arnés acolchado con tiras ajustables y anilla superior para la correa.", type: "Arnés", tags: ["Paseo", "Ajustable", "Acolchado"], basePrice: 599 },
      { slug: "fuente-huella-agua", name: "Fuente de agua con filtro", description: "Fuente eléctrica con filtro reemplazable y depósito desmontable.", type: "Fuente de agua", tags: ["Hidratación", "Filtro", "Eléctrica"], basePrice: 1_099 },
      { slug: "rascador-patitas-gato", name: "Rascador vertical para gato", description: "Rascador de sisal con base estable y plataforma superior de descanso.", type: "Rascador", tags: ["Gatos", "Sisal", "Descanso"], basePrice: 899 },
      { slug: "toalla-huella-microfibra", name: "Toalla absorbente de microfibra", description: "Toalla ligera de secado rápido para baño, paseo o limpieza de patas.", type: "Toalla", tags: ["Aseo", "Microfibra", "Secado rápido"], basePrice: 299 },
      { slug: "dispensador-patitas-premios", name: "Dispensador interactivo de premios", description: "Juguete dispensador con abertura ajustable para liberar premios durante el juego.", type: "Dispensador de premios", tags: ["Estimulación", "Juego", "Interactivo"], basePrice: 349 },
    ],
  },
  {
    category: { name: "Jardín", slug: "jardin" },
    brands: [
      { name: "Terrario", slug: "terrario" },
      { name: "Botánica", slug: "botanica" },
      { name: "Raíz", slug: "raiz" },
    ],
    images: [
      "/catalog/mandil-oliva-cocina.png",
      "/catalog/escritorio-luma-compacto.png",
    ],
    variantField: "color",
    variantOptions: ["Verde", "Terracota", "Negro", "Arena"],
    priceStep: 65,
    products: [
      { slug: "maceta-terrario-ceramica", name: "Maceta de cerámica con plato", description: "Maceta esmaltada con plato recolector para plantas de interior.", type: "Maceta", tags: ["Cerámica", "Interior", "Plato"], basePrice: 449 },
      { slug: "tijeras-botanica-poda", name: "Tijeras de poda de precisión", description: "Tijeras con hojas de acero y seguro de cierre para poda de tallos.", type: "Tijeras de poda", tags: ["Poda", "Acero", "Precisión"], basePrice: 399 },
      { slug: "pulverizador-raiz-presion", name: "Pulverizador manual de presión", description: "Pulverizador con boquilla regulable para regar plantas y aplicar soluciones.", type: "Pulverizador", tags: ["Riego", "Boquilla regulable", "Manual"], basePrice: 329 },
      { slug: "pala-terrario-trasplante", name: "Set de herramientas para trasplante", description: "Herramientas de mano para mover tierra y atender plantas en macetas.", type: "Herramientas de trasplante", tags: ["Trasplante", "Jardinería", "Set"], basePrice: 499 },
      { slug: "semillas-botanica-aromaticas", name: "Kit de semillas aromáticas", description: "Selección de semillas para cultivar hierbas aromáticas en casa.", type: "Semillas", tags: ["Aromáticas", "Cultivo", "Huerto"], basePrice: 249 },
      { slug: "manguera-raiz-expandible", name: "Manguera expandible de jardín", description: "Manguera flexible con conectores y boquilla de distintos patrones de riego.", type: "Manguera", tags: ["Riego", "Flexible", "Exterior"], basePrice: 899 },
      { slug: "guantes-terrario-nitrilo", name: "Guantes de jardinería reforzados", description: "Guantes con palma texturizada y puño extendido para proteger las manos.", type: "Guantes", tags: ["Protección", "Palma texturizada", "Jardín"], basePrice: 279 },
      { slug: "compostera-botanica-domestica", name: "Compostera doméstica compacta", description: "Contenedor ventilado con tapa para separar residuos orgánicos en casa.", type: "Compostera", tags: ["Composta", "Residuos", "Doméstica"], basePrice: 1_299 },
      { slug: "tutor-raiz-plantas", name: "Set de tutores para plantas", description: "Tutores reutilizables con clips para guiar tallos y plantas trepadoras.", type: "Tutores", tags: ["Plantas", "Soporte", "Reutilizable"], basePrice: 199 },
      { slug: "regadera-terrario-interior", name: "Regadera de pico largo para interior", description: "Regadera ligera con pico largo para alcanzar macetas y plantas de interior.", type: "Regadera", tags: ["Interior", "Riego", "Pico largo"], basePrice: 379 },
    ],
  },
  {
    category: { name: "Accesorios", slug: "accesorios" },
    brands: [
      { name: "Pulso", slug: "pulso" },
      { name: "Tránsito", slug: "transito" },
      { name: "Conecta", slug: "conecta" },
    ],
    images: [IMAGE_URL, "/catalog/camara-prisma-instantanea.png", "/catalog/mochila-vento-urbana.png"],
    variantField: "color",
    variantOptions: ["Negro", "Azul", "Arena", "Rojo"],
    priceStep: 70,
    products: [
      { slug: "correa-pulso-smartwatch", name: "Correa deportiva para smartwatch", description: "Correa flexible con ajuste rápido para relojes inteligentes compatibles.", type: "Correa para smartwatch", tags: ["Reloj", "Deporte", "Ajustable"], basePrice: 399 },
      { slug: "funda-transito-tableta", name: "Funda acolchada para tableta", description: "Funda con cierre y bolsillo exterior para proteger una tableta durante traslados.", type: "Funda para tableta", tags: ["Protección", "Acolchada", "Viaje"], basePrice: 599 },
      { slug: "cable-conecta-usbc", name: "Cable trenzado USB-C de 2 metros", description: "Cable reforzado para carga y transferencia de datos entre dispositivos compatibles.", type: "Cable USB-C", tags: ["USB-C", "Trenzado", "Carga"], basePrice: 249 },
      { slug: "adaptador-pulso-multipuerto", name: "Adaptador multipuerto para laptop", description: "Adaptador compacto con puertos de video, USB y carga para computadoras portátiles.", type: "Adaptador", tags: ["Laptop", "Conectividad", "USB"], basePrice: 1_099 },
      { slug: "organizador-transito-pasaporte", name: "Organizador de pasaporte y tarjetas", description: "Estuche delgado con espacios para pasaporte, tarjetas y comprobantes de viaje.", type: "Organizador de viaje", tags: ["Pasaporte", "Tarjetas", "Viaje"], basePrice: 449 },
      { slug: "cargador-conecta-auto", name: "Cargador USB para automóvil", description: "Cargador para toma de auto con dos puertos y protección eléctrica integrada.", type: "Cargador para auto", tags: ["Automóvil", "USB", "Carga"], basePrice: 329 },
      { slug: "tripie-pulso-celular", name: "Trípode compacto para celular", description: "Trípode plegable con soporte ajustable para fotografía y videollamadas.", type: "Trípode", tags: ["Fotografía", "Plegable", "Celular"], basePrice: 699 },
      { slug: "cartera-transito-minimalista", name: "Cartera compacta con protección RFID", description: "Cartera ligera con compartimentos para tarjetas y recubrimiento de bloqueo RFID.", type: "Cartera", tags: ["Tarjetas", "RFID", "Compacta"], basePrice: 599 },
      { slug: "bocina-conecta-mini", name: "Bocina portátil resistente a salpicaduras", description: "Bocina inalámbrica compacta con correa y controles físicos de reproducción.", type: "Bocina portátil", tags: ["Bluetooth", "Portátil", "Audio"], basePrice: 899 },
      { slug: "lentes-pulso-proteccion", name: "Lentes con filtro para pantalla", description: "Lentes ligeros con filtro transparente para sesiones de trabajo frente a pantallas.", type: "Lentes", tags: ["Pantalla", "Ligero", "Accesorios"], basePrice: 499 },
    ],
  },
];

let nextAdditionalProductNumber = products.length + expandedProducts.length + 1;
const additionalProducts: SeedProduct[] = additionalProductGroups.flatMap((group) =>
  group.products.map((product, groupIndex) => {
    const productNumber = nextAdditionalProductNumber++;
    const brand = group.brands[groupIndex % group.brands.length]!;
    const variants = group.variantOptions.map((option, variantIndex) => ({
      id: `a2000000-0000-4000-8000-${String(productNumber * 100 + variantIndex + 1).padStart(12, "0")}`,
      sku: `DEMO-${String(productNumber).padStart(3, "0")}-${String(variantIndex + 1).padStart(2, "0")}`,
      [group.variantField]: option,
      listPrice: product.basePrice + variantIndex * group.priceStep,
    } as SeedVariant));

    return {
      id: `a1000000-0000-4000-8000-${String(productNumber).padStart(12, "0")}`,
      slug: product.slug,
      name: `${brand.name} ${product.name}`,
      description: product.description,
      category: group.category,
      brand,
      tags: [product.type, ...product.tags],
      imageUrl: group.images[groupIndex % group.images.length]!,
      variants,
    };
  }),
);

async function referencedId(
  client: PoolClient,
  table: "catalog_categories" | "catalog_brands",
  name: string,
  slug: string,
): Promise<string> {
  await client.query(
    `INSERT INTO ${table} (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`,
    [name, slug],
  );
  const result = await client.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("Catalog seed reference was not found.");
  }
  return id;
}

async function seedProduct(client: PoolClient, product: SeedProduct): Promise<boolean> {
  const categoryId = await referencedId(
    client,
    "catalog_categories",
    product.category.name,
    product.category.slug,
  );
  const brandId = await referencedId(
    client,
    "catalog_brands",
    product.brand.name,
    product.brand.slug,
  );
  const productResult = await client.query(
    `
      INSERT INTO catalog_products (
        id, category_id, brand_id, name, slug, description, tags, image_url, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
      ON CONFLICT (slug) DO NOTHING
    `,
    [
      product.id,
      categoryId,
      brandId,
      product.name,
      product.slug,
      product.description,
      product.tags,
      product.imageUrl,
    ],
  );
  const linkedProduct = await client.query<{ id: string }>(
    "SELECT id FROM catalog_products WHERE slug = $1 LIMIT 1",
    [product.slug],
  );
  const productId = linkedProduct.rows[0]?.id;
  if (!productId) {
    throw new Error("Catalog seed product was not found.");
  }
  const variants = product.variants ?? (product.variant ? [product.variant] : []);
  if (variants.length === 0) {
    throw new Error("Catalog seed product has no variants.");
  }
  let changed = (productResult.rowCount ?? 0) > 0;
  for (const variant of variants) {
    const variantResult = await client.query(
      `
        INSERT INTO catalog_product_variants (
          id, product_id, sku, size, color, material, list_price, currency, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'MXN', 'ACTIVE')
        ON CONFLICT (sku) DO NOTHING
      `,
      [
        variant.id,
        productId,
        variant.sku,
        variant.size ?? null,
        variant.color ?? null,
        variant.material ?? null,
        variant.listPrice,
      ],
    );
    changed = (variantResult.rowCount ?? 0) > 0 || changed;
  }
  return changed;
}

async function run(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Catalog seed is disabled in production.");
  }

  const config = loadDatabaseConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: true } : undefined,
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    let changed = false;
    for (const product of [...products, ...expandedProducts, ...additionalProducts]) {
      changed = (await seedProduct(client, product)) || changed;
    }
    if (changed) {
      await client.query(
        `
          UPDATE catalog_metadata
          SET value = value + 1, updated_at = NOW()
          WHERE key = 'catalog_version'
        `,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run()
  .then(() => process.stdout.write("Local catalog seed completed.\n"))
  .catch(() => {
    // Do not emit SQL or connection details from a failing seed command.
    process.stderr.write("Catalog seed failed.\n");
    process.exitCode = 1;
  });
