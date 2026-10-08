# Orders Service

Servicio NestJS propietario de pedidos, líneas, snapshots de precio,
idempotencia y auditoría. Tiene su propio PostgreSQL y nunca consulta una
base de datos ajena: resuelve variantes por la API de Catalog, cotiza por
Pricing y reserva/consume mediante los contratos internos de Inventory.

## Contratos de la Fase 5

| Ruta | Acceso |
| --- | --- |
| POST /orders | ADMIN, EMPLOYEE, CUSTOMER; requiere Idempotency-Key |
| GET /orders | ADMIN, EMPLOYEE |
| GET /orders/:id | ADMIN, EMPLOYEE o CUSTOMER propietario |
| POST /orders/:id/cancel | ADMIN, EMPLOYEE o CUSTOMER propietario |

Cada línea de entrada lleva productId y variantId. Orders consulta el producto
activo en Catalog para tomar SKU, nombre, categoría y precio base; después
consulta Pricing y guarda listUnitPrice, unitPrice y descuentos como snapshots
inmutables. El navegador no recibe la llave de Inventory ni contacta servicios
internos.

La cancelación de una reserva aún no consumida la libera de inmediato. Antes de
cancelar una orden online `CONFIRMED`, Orders consulta por red privada la
decisión atómica de Logistics: acepta `PENDING` y `PACKING`, pero responde
`409 ORDER_ALREADY_DISPATCHED` si ya está `SHIPPED` o `DELIVERED`. Si Logistics
no está disponible, la orden queda en `CANCELLATION_PENDING` para reintentar;
no se publica la compensación ni se declara un reembolso. Sólo una decisión
aceptada persiste `CANCELLED` y emite `order.cancelled.v1` para Inventory.

## Calidad

En este directorio ejecuta:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```
