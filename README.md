# Plataforma Departamental

Este repositorio se desarrolla tomando como fuente principal de verdad
`Proyecto_Universitario_Tienda_Departamental_Historias_Detalladas.docx`.
La meta es una plataforma omnicanal de microservicios, no convertir el MVP
existente de Next.js en un monolito mayor.

## Estado de implementación

Las Fases 1 a 6 están implementadas: Gateway Kong, Auth Service, Catalog
Service con Redis cache-aside, Inventory Service, Pricing Service, Orders
Service y RabbitMQ con Outbox transaccional. La Fase 7 añade Realtime Service
para propagar cambios de inventario al Dashboard. Cada servicio conserva su
propia base PostgreSQL cuando el dominio lo requiere. JWT tiene refresh
rotativo, el catálogo público ya no usa Route Handlers de Next.js ni la base
heredada y el inventario ya aplica reservas condicionales con idempotencia.

```text
Navegador → Next.js (UI) → Kong Gateway ─┬→ Auth Service → PostgreSQL Auth
                                          ├→ Catalog Service → PostgreSQL Catalog
                                          │                    ↘ Redis Catalog
                                          ├→ Inventory Service → PostgreSQL Inventory
                                          ├→ Pricing Service → PostgreSQL Pricing
                                          ├→ Orders Service → PostgreSQL Orders
                                               ├→ Catalog API
                                               ├→ Pricing API
                                               └→ Inventory API privada
                                          └→ Logistics Service → PostgreSQL Logistics

Orders → RabbitMQ → Logistics Service → RabbitMQ → consumidores de envíos
Inventory, Pricing y Orders → RabbitMQ (eventos de dominio) → Realtime Service
Navegador ← Socket.IO ← Kong Gateway ← Realtime Service
```

- El frontend utiliza únicamente el Gateway para identidad y catálogo; no
  conoce puertos internos ni accede a ninguna base de datos de servicio.
- Kong es DB-less y aplica CORS explícito, `X-Correlation-Id`, JWT y límites
  de tasa. Auth y `auth-postgres` no publican puertos al host.
- Auth es dueño exclusivo de usuarios, roles y refresh tokens; Catalog es
  dueño de productos, categorías, marcas y variantes; Inventory es dueño de
  stock, reservas, movimientos y mínimos; Pricing es dueño de promociones;
  Orders es dueño de pedidos, líneas históricas, auditoría e idempotencia; y
  Logistics es dueño de envíos y sus transiciones operativas. No
  comparten bases, credenciales ni FKs entre servicios.
- Los roles son exactamente `ADMIN`, `EMPLOYEE` y `CUSTOMER`; se validan en el
  backend, se verifican de nuevo en páginas/handlers y se reflejan en la
  navegación del frontend.

## Roadmap de desarrollo

| Fase | Entregable | Estado |
| --- | --- | --- |
| 1 | API Gateway + Auth: entrada única, identidad y roles. | Implementada y validada. |
| 2 | Catalog Service: productos, categorías y variantes. | Implementada y validada. |
| 3 | Inventory Service: stock, movimientos, mínimos y concurrencia. | Implementada y validada. |
| 4 | Pricing Service: cotización y promociones programadas. | Implementada y validada. |
| 5 | Order / Sales Service: pedidos, reservas y snapshot de precio. | Implementada y validada. |
| 6 | RabbitMQ + Outbox: eventos confiables y desacoplamiento. | Implementada y validada. |
| 7 | Realtime + inventario Dashboard. | Implementada y validada. |
| 8 | Analytics + Chart.js: proyecciones de lectura, KPIs y gráficas administrativas. | Implementada y validada. |
| 9 | Pick & Pack y transiciones de Logistics. | Implementada y validada. |
| 10 | Maps / tracking de repartidores. | Implementada y validada. |
| 11 | CRM: historial proyectado y segmentación. | Pendiente |
| 12 | Notification + campañas asíncronas. | Pendiente |

## Fase 1: identidad y permisos

### Gateway y Auth Service

Kong expone la API en `http://localhost:8000` y enruta los contratos de Auth:

| Ruta | Acceso |
| --- | --- |
| `POST /auth/login` | Público; rate limit por IP. |
| `POST /auth/refresh` | Refresh token opaco; funciona aun si el access token expiró o no existe. |
| `POST /auth/logout` | Refresh token opaco o Bearer; con refresh revoca esa sesión aun sin access token. |
| `GET /auth/me` | JWT Bearer. |
| `GET /auth/users` | Solo `ADMIN`; endpoint administrativo de identidad sin hashes ni contraseñas. |
| `GET /health` | Público; comprueba Auth y su PostgreSQL. |

Las respuestas de Auth usan `{ code, message, correlationId }` ante error. El
access token HS256 incluye `iss: departamental-auth-service`, `sub`, `role`,
`exp` y `jti`. La variable `JWT_ACCESS_SECRET` se genera en base64url, pero
Nest y Kong usan el mismo valor literal como clave HMAC; así las firmas son
compatibles de extremo a extremo.

La renovación rota el refresh token y detecta su reutilización: al reutilizar
uno ya rotado se revoca su familia y no se emite un nuevo access token. El
cierre de sesión por refresh es idempotente para no revelar si una sesión
existía; el Gateway conserva CORS y rate limiting en ambas rutas.

### Matriz de permisos vigente

| Acción disponible hoy | ADMIN | EMPLOYEE | CUSTOMER |
| --- | ---:| ---:| ---:|
| Dashboard heredado de administración | Sí | No | No |
| Área operativa inicial | Sí | Sí | No |
| Pick & Pack y transiciones de envíos | Sí | Sí | No |
| Crear pedidos | Sí | Sí | Sí |
| Reglas de precio heredadas | Sí | No | No |
| Identidades `/auth/users` | Sí | No | No |
| Crear o modificar productos y variantes | Sí | No | No |
| Consultar catálogo publicado | Sí | Sí | Sí |
| Pantalla de gestión de catálogo | Sí | No | No |
| Cuenta y sesión | Sí | Sí | Sí |

Los controles de interfaz solo mejoran la experiencia: la autorización real se
aplica también en el servidor. Las rutas heredadas aún protegidas son
`/api/dashboard/inventory` (`ADMIN`) y `/api/admin/price-rules` (`ADMIN`).
Los pedidos ya se atienden exclusivamente en Orders vía Gateway; `CUSTOMER`
sólo puede leer o cancelar los propios, mientras que `ADMIN` y `EMPLOYEE`
pueden listar y consultar operaciones.

## Fase 5: Órdenes y ventas

Kong publica estos contratos con JWT:

| Ruta | Acceso |
| --- | --- |
| `POST /orders` | `ADMIN`, `EMPLOYEE`, `CUSTOMER`; requiere `Idempotency-Key`. |
| `GET /orders` | `ADMIN`, `EMPLOYEE`. |
| `GET /orders/:id` | Operación o el `CUSTOMER` propietario. |
| `POST /orders/:id/cancel` | Operación o el `CUSTOMER` propietario. |

Orders toma el precio efectivo desde Pricing, conserva el snapshot de producto
y precio en sus propias líneas, reserva y confirma stock mediante la API
privada de Inventory y nunca lee tablas ajenas. Repetir el mismo checkout con
la misma clave devuelve el mismo pedido sin volver a consumir existencias; un
pedido que no alcanza stock devuelve `409 OUT_OF_STOCK`. La cancelación de una
orden ya confirmada se compensa mediante `order.cancelled.v1`, sin acoplar
Orders a la base de Inventory.

## Fase 6: RabbitMQ y Outbox transaccional

RabbitMQ vive exclusivamente en la red privada `events-internal`. Cada servicio
persiste su cambio de negocio y su evento pendiente dentro de la misma
transacción PostgreSQL: `orders_outbox_events`, `inventory_outbox_events` o
`pricing_outbox_events`. Un publisher local toma trabajos con `FOR UPDATE SKIP
LOCKED`, espera la confirmación del broker y conserva el evento para reintento
exponencial si RabbitMQ no responde. Por tanto, una venta confirmada nunca se
pierde por una caída temporal del broker.

| Evento versionado | Productor | Consumidor disponible |
| --- | --- | --- |
| `order.created.v1`, `order.completed.v1` | Orders | Preparados para CRM, Analytics y Notification. |
| `order.cancelled.v1` | Orders | Inventory repone el stock. |
| `inventory.stock.changed.v1`, `inventory.low-stock.v1` | Inventory | Realtime entrega cambios de stock; Analytics preparado. |
| `promotion.activated.v1`, `promotion.expired.v1` | Pricing | Preparados para Catalog y Realtime. |

Los mensajes usan un envelope con `eventId`, `eventType`, `occurredAt`,
`correlationId`, `producer` y `data`. Inventory registra los `eventId`
procesados antes de la reposición; una reentrega no genera una segunda entrada
de stock. La cola `inventory.order-cancelled.v1` reintenta hasta el límite
configurado y mueve fallos persistentes a
`inventory.order-cancelled.v1.dlq`, observable y separada del flujo de venta.

## Fase 7: Realtime e inventario operativo

`realtime-service` no posee datos de negocio ni consulta bases de otros
servicios. Consume la cola duradera `realtime.inventory-stock.v1`, enlazada a
`inventory.stock.changed.v1`, valida el envelope y transmite `stock.updated`
por Socket.IO. Los eventos inválidos pasan a su propia DLQ; los `eventId`
recientes se deduplican para que una reentrega no produzca una actualización
duplicada en la vista.

Kong publica únicamente `/realtime/socket.io`. La conexión reutiliza la cookie
HTTP-only `departamental_access`; Kong la verifica y Realtime la valida de
nuevo, admitiendo solo el rol `ADMIN`. El token nunca se expone a JavaScript.
Si la conexión cae, el Dashboard conserva la última lectura y vuelve a pedir el
snapshot actual mediante Gateway, sin acceder a Inventory ni a su PostgreSQL de
forma directa.

El Dashboard ahora muestra por sucursal el inventario oficial con producto,
SKU, variante, existencias físicas, reservas, disponible y punto de pedido. Las
variantes `available <= reorder_point` se destacan en rojo y `available = 0`
se etiquetan explícitamente como `AGOTADO`; cada vista indica la última
sincronización recibida.

## Fase 8: Analytics y Dashboard comercial

`analytics-service` es dueño exclusivo de PostgreSQL Analytics y mantiene
proyecciones de lectura; nunca consulta las bases de Orders ni Inventory. Su
consumidor durable `analytics.projections.v1` recibe
`order.completed.v1`, `order.cancelled.v1` e
`inventory.stock.changed.v1`. Cada `eventId` se registra de forma transaccional
antes de modificar una proyección, por lo que una reentrega no duplica ventas,
líneas ni existencias. Los eventos inválidos terminan en su DLQ.

Los reportes se consultan solo mediante Gateway y requieren el rol `ADMIN` en
Kong y de nuevo en Analytics:

| Ruta | Uso |
| --- | --- |
| `GET /analytics/sales/today` | Importe y tickets completados del día. |
| `GET /analytics/sales/by-branch?period=today|7d|30d` | Ventas por sucursal; incluye cero para sucursales proyectadas sin ventas. |
| `GET /analytics/products/top?period=...&limit=5|10|20` | Ranking por unidades vendidas; excluye cancelaciones. |
| `GET /analytics/ticket-average?period=...` | Ventas completadas / tickets completados. |
| `GET /analytics/inventory/by-branch` | Agregado de existencias, reservas y disponible. |

El Dashboard ADMIN conserva el panel operativo de Inventario y añade Chart.js
para ventas por sucursal, top productos y distribución de stock. La primera
carga se resuelve en Server Components por Gateway; los filtros interactivos
usan el BFF de Next.js con TanStack Query. Todos los reportes indican la última
proyección y presentan un estado vacío o de retraso sin impedir que ventas e
inventario sigan funcionando.

## Fase 9: Pick & Pack y Logistics

`logistics-service` es dueño de su PostgreSQL y no consulta la base de Orders.
Su consumidor durable `logistics.order-events.v1` proyecta
`order.completed.v1` en un envío con snapshot de artículos y procesa
`order.cancelled.v1` para retirar pedidos cancelados de preparación. El
`eventId` se registra transaccionalmente, de modo que una reentrega no crea un
segundo envío. Cada transición y su actor quedan en
`logistics_shipment_transitions`; su outbox publica
`shipment.status.changed.v1` con confirmación del broker.

Kong publica estos contratos solo con JWT y Logistics vuelve a validar el rol:

| Ruta | Acceso |
| --- | --- |
| `GET /shipments` | `ADMIN`, `EMPLOYEE`; solo Pendiente, Empacando y Enviado. |
| `GET /shipments/:id` | `ADMIN`, `EMPLOYEE`; incluye el historial auditado. |
| `PATCH /shipments/:id/status` | `ADMIN`, `EMPLOYEE`; requiere `{ status, version }`. |

Las transiciones operativas son explícitas: `PENDING → PACKING → SHIPPED`.
Una petición con una versión anterior o una transición inválida responde
`409`, por lo que dos empleados no pueden sobrescribir el trabajo del otro.
`CANCELLED` nunca puede volver a preparación. La Fase 10 completa el avance
de última milla con `SHIPPED → DELIVERED`. La página `/operations` usa
Server Components para el primer snapshot y TanStack Query contra un BFF de
Next.js para refresco cada 15 segundos, detalle del pedido y cambio de estado;
la UI nunca conoce el puerto o la base interna de Logistics.

## Fase 10: Maps y seguimiento de repartidores

`logistics-service` conserva repartidores, la última ubicación y la dirección
de entrega en su PostgreSQL exclusivo. La ubicación requiere coordenadas
válidas y timestamp; una señal más antigua no sobreescribe una señal más nueva.
El umbral de frescura es de cinco minutos, por lo que la interfaz diferencia
claramente una señal reciente, una anterior y la ausencia de ubicación.

| Ruta | Acceso |
| --- | --- |
| `PATCH /shipments/:id/tracking` | `ADMIN`, `EMPLOYEE`; asigna repartidor y dirección de entrega. |
| `POST /couriers/:id/location` | `ADMIN`, `EMPLOYEE`; registra `{ shipmentId, latitude, longitude, recordedAt? }`. |
| `GET /couriers/:id/location` | `ADMIN`, `EMPLOYEE`; consulta la última señal. |
| `GET /shipments` y `GET /shipments/:id` | Operación; `CUSTOMER` recibe solo los propios y sin ubicación ni datos internos del repartidor. |

Cada ubicación aceptada se publica como `shipment.tracking.updated.v1` desde
el Outbox de Logistics. `realtime-service` la consume mediante la cola durable
`realtime.courier-tracking.v1`, deduplica por `eventId` y emite
`courier.location.updated` únicamente a `ADMIN` y `EMPLOYEE` autenticados.

La pantalla `/operations` usa Google Maps JavaScript API para el marcador y
Google Routes desde un BFF del servidor para calcular la ruta. La llave de
Routes permanece en `GOOGLE_MAPS_ROUTES_API_KEY`; la llave de navegador se
entrega solo a la pantalla operativa y debe restringirse por referrer. Si Maps,
la ruta o las credenciales no están disponibles, la interfaz conserva la
dirección y la última ubicación sin bloquear Pick & Pack. El CUSTOMER ve el
estado y la fecha de actualización de sus propias entregas desde `/account`.

## Arranque local con Docker Compose

Se requiere Docker Desktop. Antes de iniciar, crea un archivo `.env` a partir
de `.env.example`, genera `JWT_ACCESS_SECRET` y define las contraseñas de cada
PostgreSQL de servicio; no uses los valores de ejemplo en un entorno compartido.

```powershell
Copy-Item .env.example .env
# Edita .env y sustituye JWT_ACCESS_SECRET, AUTH_DB_PASSWORD y CATALOG_DB_PASSWORD.
docker compose config
docker compose up --build
```

La aplicación web queda en `http://localhost:3000` y el Gateway en
`http://localhost:8000`. En desarrollo local se pueden crear los tres usuarios
semilla de Auth y los seis productos de Catalog; consulta
[Auth Service](services/auth-service/README.md) y
[Catalog Service](services/catalog-service/README.md) para sus contratos y
configuración aislada.

El Compose mantiene `postgres` y `redis` del MVP únicamente para no romper el
trabajo existente. Auth, Catalog, Inventory, Pricing, Orders y Logistics tienen volúmenes,
redes y credenciales propias; `catalog-redis` sólo sirve al patrón cache-aside
de Catalog. RabbitMQ usa volumen propio y no publica puertos al host. Los
servicios no crean tablas en bases de otros dominios.

## Desarrollo sin contenedores

La UI puede compilar y arrancar sin contenedores:

```bash
npm install
npm run dev
```

Para obtener identidad y productos reales se necesitan Gateway, Auth, Catalog,
sus bases y Redis Catalog mediante Compose o mediante los comandos de sus
READMEs. Nunca cambies el frontend para apuntar directo a los puertos internos
`3001` o `3002`.

## Calidad

Ejecuta todas estas verificaciones antes de declarar lista una fase:

```bash
# UI / frontend
npm run typecheck
npm run lint
npm test
npm run build

# Auth Service
cd services/auth-service
npm run typecheck
npm run lint
npm test
npm run build

# Catalog Service
cd ../catalog-service
npm run typecheck
npm run lint
npm test
npm run build

# Inventory, Pricing y Orders Service
cd ../inventory-service && npm run typecheck && npm run lint && npm test && npm run build
cd ../pricing-service && npm run typecheck && npm run lint && npm test && npm run build
cd ../orders-service && npm run typecheck && npm run lint && npm test && npm run build
cd ../realtime-service && npm run typecheck && npm run lint && npm test && npm run build
cd ../logistics-service && npm run typecheck && npm run lint && npm test && npm run build
```

Las validaciones en contenedor que complementan estas pruebas son `docker
compose config`, healthchecks y contratos a través del Gateway. Docker Desktop
está disponible en el entorno local actual y estas validaciones se ejecutan al
cerrar cada fase.

## Legado de transición

Inventario y precios heredados dentro de Next.js son un slice demostrativo
previo. El checkout heredado se retiró: los pedidos sólo pasan por Orders. El
catálogo público ya fue extraído: las rutas `/api/products` se retiraron y la
UI usa Server Components más TanStack Query contra Kong. Las siguientes fases
sustituirán los dominios restantes por su microservicio NestJS, PostgreSQL
exclusivo y, cuando aplique, RabbitMQ/Outbox.
Redis seguirá siendo cache-aside, nunca la fuente oficial de catálogo o
inventario.
