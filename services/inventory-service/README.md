# Inventory Service

Servicio NestJS independiente para stock por sucursal, movimientos,
reservas y mínimos de reabastecimiento. Es propietario exclusivo de
PostgreSQL Inventory y no usa una FK, credencial ni consulta en la base de
Catalog.

## Contratos de la Fase 3

| Ruta | Acceso |
| --- | --- |
| GET /inventory | ADMIN, EMPLOYEE mediante Gateway y JWT |
| GET /inventory/branches/:branchId | ADMIN, EMPLOYEE mediante Gateway y JWT |
| GET /inventory/low-stock | ADMIN, EMPLOYEE mediante Gateway y JWT |
| POST /inventory/movements | ADMIN, EMPLOYEE mediante Gateway y JWT |
| POST /inventory/reservations | Privada: Order Service |
| POST /inventory/reservations/:id/commit | Privada: Order Service |
| POST /inventory/reservations/:id/release | Privada: Order Service |

Las tres rutas de reserva no tienen una ruta Kong. En la Fase 5, Orders las
llamará desde la red interna con los encabezados X-Internal-Service-Key e
Idempotency-Key; el navegador nunca recibe esa llave. El servicio retiene el
actor y la llave temporalmente para que un reintento devuelva el resultado
previo sin alterar otra vez el stock.

La reserva usa una transacción y una actualización condicional sobre
on_hand - reserved; cuando no hay disponibilidad responde 409 OUT_OF_STOCK.
Las reservas vencidas liberan exactamente la cantidad reservada antes de
nuevas operaciones. Los invariantes de PostgreSQL impiden cantidades negativas
y que reserved exceda on_hand.

inventory_variant_snapshots es una proyección de lectura bajo propiedad de
Inventory. El seed local contiene los mismos UUID de variante demostrativos
de Catalog; en la Fase 6 los eventos y el Outbox mantendrán esa proyección
sin acoplar las bases de datos.

Los movimientos administrativos conservan actor, rol, correlationId y
resultado en inventory_audit_log. Cada mutación también deja el registro
operativo correspondiente. La publicación confiable de
inventory.stock.changed.v1 se activa junto con RabbitMQ y Transactional Outbox
en la Fase 6; Realtime lo consumirá en la Fase 7.

## Variables de entorno

- DATABASE_URL: conexión exclusiva al PostgreSQL de Inventory.
- JWT_ACCESS_SECRET: secreto HMAC compartido solo para validar access JWT.
- INVENTORY_INTERNAL_SERVICE_KEY: secreto base64url de 32 bytes o más para
  las llamadas internas de Orders.
- INVENTORY_RESERVATION_TTL_SECONDS: duración de reserva; 900 por defecto.
- CORS_ORIGINS: lista explícita de orígenes permitidos.
- RUN_MIGRATIONS y RUN_SEED: solo desarrollo local; el seed se rechaza en
  producción.

## Calidad

Ejecuta en este directorio npm run typecheck, npm run lint, npm test y npm run
build. Las pruebas de integración contra PostgreSQL y los contratos Gateway se
ejecutan mediante contenedores cuando Docker está disponible.
