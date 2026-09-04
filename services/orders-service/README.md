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

La cancelación de una reserva aún no consumida la libera de inmediato. Una
cancelación de un pedido ya CONFIRMED se persiste y será compensada mediante
order.cancelled.v1 y el Outbox de la Fase 6; no se inventa una escritura
directa en Inventory fuera de su contrato.

## Calidad

En este directorio ejecuta:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```
