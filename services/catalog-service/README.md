# Catalog Service

Microservicio NestJS dueño exclusivo de productos, categorías, marcas, variantes y metadatos comerciales. Persiste únicamente en **PostgreSQL Catalog** y usa Redis como caché *cache-aside* opcional. No lee ni escribe las bases de Auth, Inventory, Pricing u Orders.

El precio de lista y la moneda son datos comerciales de la variante; el precio efectivo, promociones y disponibilidad pertenecen a las fases de Pricing e Inventory. Por ello, este servicio no inventa descuentos ni stock.

## Contrato HTTP

Todas las respuestas de error usan el siguiente formato, sin detalles internos ni *stack traces*:

```json
{
  "code": "DUPLICATE_SKU",
  "message": "El SKU ya está registrado",
  "correlationId": "..."
}
```

| Método y ruta | Autorización | Uso |
| --- | --- | --- |
| `GET /health` | Pública | Comprueba PostgreSQL; Redis puede estar degradado. |
| `GET /products` | Pública | Búsqueda paginada cacheada. |
| `GET /products/:id` | Pública | Detalle cacheado por UUID o slug. |
| `POST /products` | `ADMIN` | Crea un producto y sus referencias de categoría/marca. |
| `PATCH /products/:id` | `ADMIN` | Actualiza o desactiva un producto. |
| `POST /products/:id/variants` | `ADMIN` | Registra una variante con SKU único. |
| `PATCH /variants/:id` | `ADMIN` | Actualiza o desactiva una variante; no existe borrado físico. |

`GET /products` acepta `search`, `category`, `brand`, `page` y `pageSize` (máximo 100), por ejemplo:

```text
GET /products?search=televisor&category=electronica&page=1&pageSize=20
```

Su respuesta es:

```json
{
  "items": [
    {
      "id": "uuid",
      "slug": "smart-tv-aurora-55",
      "name": "Smart TV Aurora 55\" 4K",
      "description": "...",
      "category": { "id": "uuid", "name": "Electrónica", "slug": "electronica" },
      "brand": { "id": "uuid", "name": "Aurora", "slug": "aurora" },
      "tags": ["4K", "HDR"],
      "imageUrl": "/catalog/departmental-products-v1.png",
      "variants": [
        {
          "id": "uuid",
          "sku": "AUR-55-4K",
          "size": "55 pulgadas",
          "color": null,
          "material": null,
          "label": "55 pulgadas",
          "listPrice": 12999,
          "currency": "MXN"
        }
      ]
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

Las lecturas públicas excluyen productos y variantes `INACTIVE`. Las rutas administrativas incluyen el campo `status` en su respuesta. El JWT se vuelve a validar en Catalog con HS256, `iss: departamental-auth-service`, `sub`, `role`, `exp` y `jti`; Catalog no consulta `auth_users`, porque esa base pertenece a Auth.

## Escrituras administrativas

El cuerpo de `POST /products` es:

```json
{
  "name": "Smart TV Aurora 55\" 4K",
  "description": "Panel 4K con HDR.",
  "category": { "name": "Electrónica", "slug": "electronica" },
  "brand": { "name": "Aurora", "slug": "aurora" },
  "tags": ["4K", "HDR"],
  "imageUrl": "/catalog/departmental-products-v1.png",
  "status": "ACTIVE"
}
```

`slug` es opcional para producto, categoría y marca: si no se recibe, se deriva del nombre. Las referencias de categoría y marca se crean o actualizan de forma idempotente por su `slug`, ya que el documento no define endpoints CRUD separados para ellas.

El cuerpo de `POST /products/:id/variants` es:

```json
{
  "sku": "AUR-55-4K",
  "size": "55 pulgadas",
  "color": "Negro",
  "material": "Aluminio",
  "listPrice": 12999,
  "currency": "MXN",
  "status": "ACTIVE"
}
```

Talla, color y material son campos independientes; `label` se deriva de ellos. Un SKU repetido devuelve `409` con `code: "DUPLICATE_SKU"`. Para conservar historia de pedidos no hay `DELETE`; `PATCH /variants/:id` permite `{"status":"INACTIVE"}`.

## Caché y degradación

Las búsquedas usan claves normalizadas y versionadas. Primero se revisa Redis; un HIT devuelve el JSON sin consultar PostgreSQL. En MISS se consulta PostgreSQL y se guarda por 120 segundos; los detalles duran 600 segundos. Al cambiar un producto o variante, la versión se incrementa dentro de la misma transacción que el cambio: las claves anteriores quedan lógicamente invalidadas y expiran sin afectar lecturas futuras.

Si Redis no está configurado o falla, el servicio continúa contra PostgreSQL. Redis jamás es autoridad. Si PostgreSQL no responde y no existe una respuesta cacheada válida, el filtro global devuelve un error controlado `503 SERVICE_UNAVAILABLE` cuando reconoce una falla de conexión.

## Configuración y desarrollo local

| Variable | Requerida | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | Sí | URL de PostgreSQL exclusiva de Catalog. |
| `DATABASE_SSL` | No | `true` para TLS con verificación. |
| `REDIS_URL` | No | URL `redis://` o `rediss://`; al omitirla se deshabilita el caché. |
| `JWT_ACCESS_SECRET` | Sí | Mismo valor base64url de alta entropía usado por Auth y Kong. |
| `CORS_ORIGINS` | Sí en producción | Orígenes separados por coma; no admite `*`. |
| `CATALOG_SEARCH_CACHE_TTL_SECONDS` | No | TTL de búsqueda; 120 por defecto. |
| `CATALOG_PRODUCT_CACHE_TTL_SECONDS` | No | TTL de detalle; 600 por defecto. |
| `RUN_MIGRATIONS` | No | `true` por defecto en el entrypoint. |
| `RUN_SEED` | No | Semillas locales; `false` por defecto y bloqueado en producción. |

```powershell
npm install
$env:DATABASE_URL = 'postgresql://catalog_service:contraseña-local@localhost:5434/catalog_service'
$env:REDIS_URL = 'redis://localhost:6380'
$env:JWT_ACCESS_SECRET = node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
npm run db:migrate
npm run db:seed
npm run start:dev
```

El seed no se ejecuta en producción. En una base nueva crea seis productos `ACTIVE`, todos con `imageUrl: "/catalog/departmental-products-v1.png"`:

| Producto | UUID | Sprite sugerido |
| --- | --- | --- |
| `smart-tv-aurora-55` | `a1000000-0000-4000-8000-000000000001` | `0% 0%` |
| `audifonos-nova-anc` | `a1000000-0000-4000-8000-000000000002` | `50% 0%` |
| `lampara-lumen-mesa` | `a1000000-0000-4000-8000-000000000003` | `100% 0%` |
| `tenis-kinetic-run` | `a1000000-0000-4000-8000-000000000004` | `0% 100%` |
| `silla-atelier` | `a1000000-0000-4000-8000-000000000005` | `50% 100%` |
| `reloj-vertex-fit` | `a1000000-0000-4000-8000-000000000006` | `100% 100%` |

## Calidad

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

El contenedor escucha internamente en el puerto `3002`. Solo Gateway debe enrutarlo; ni PostgreSQL Catalog ni Redis Catalog necesitan puertos expuestos al host.
