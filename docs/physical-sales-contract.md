# Contrato de venta física — Fase 1

La venta física es una orden con `channel: "PHYSICAL"`; **Orders** conserva
la venta, sus snapshots, auditoría e idempotencia. No es un ajuste directo de
stock desde el navegador.

## Entrada pública

`POST /orders` acepta `Idempotency-Key` y el cuerpo ya publicado por Gateway:

```json
{
  "channel": "PHYSICAL",
  "branchId": "uuid-de-sucursal",
  "customerId": "uuid-del-cliente",
  "items": [{ "productId": "uuid", "variantId": "uuid", "quantity": 1 }]
}
```

Solo `ADMIN` y `EMPLOYEE` pueden elegir `PHYSICAL`. `CUSTOMER` conserva el
canal `ONLINE` y nunca puede atribuir la compra a otra identidad. Para que CRM
y Analytics puedan relacionar la compra, una venta física debe incluir el
cliente. El campo se guarda en la base propia de Orders junto con quién la
registró y el `correlationId` de auditoría.

## Recorrido de consistencia

1. Orders consulta la variante activa en Catalog y obtiene el precio efectivo
   en Pricing; guarda snapshots inmutables.
2. Orders reserva y confirma por la API privada de Inventory con claves
   derivadas de la `Idempotency-Key` original. Inventory publica
   `inventory.stock.changed.v1` dentro de su Outbox.
3. Realtime retransmite `stock.updated` al Dashboard. Cuando `available = 0`,
   la variante se presenta como **AGOTADO**; cuando `available <= reorder_point`
   aparece en el listado crítico.
4. Orders emite `order.created.v1` y `order.completed.v1` con `channel`, para
   que Analytics y CRM no necesiten leer su base de datos.

La ruta `POST /inventory/movements` se conserva para movimientos operativos
auditados de `ADMIN`/`EMPLOYEE`; no será llamada por el flujo de caja.

## Caja operativa — Fase 2

La vista protegida `/operations/sales` está disponible solamente para
`ADMIN` y `EMPLOYEE`. Permite elegir sucursal y variante, limita cantidades a
la disponibilidad mostrada y presenta **AGOTADO** cuando una variante no tiene
existencias. El servidor Next.js vuelve a validar el rol, el identificador del
cliente y cada UUID antes de enviar la solicitud a Gateway. El importe visible
es de lista; el ticket confirmado siempre devuelve el total efectivo de
Pricing. La medición de latencia de extremo a extremo queda para la fase de
observabilidad, sin falsear su resultado desde la interfaz.

## Sincronización inmediata — Fase 3

El Dashboard de `ADMIN` aplica el evento canónico `stock.updated` directamente
al estado visible cuando la variante ya pertenece a la sucursal abierta. Así,
una venta física que lleve el disponible a cero muestra **AGOTADO** y actualiza
las alertas de reabastecimiento sin esperar una segunda consulta HTTP. Si
Inventory anuncia una variante todavía desconocida para la vista, se hace una
recarga oficial de respaldo para conservar el nombre, SKU y atributos que son
propiedad de ese servicio.

La interfaz conserva las últimas 50 entregas de Realtime y enseña su p95 móvil.
Un p95 superior a 3 segundos deja una advertencia visible para operación; la
métrica se calcula desde `occurredAt` recibido, sin modificar eventos ni
presentar una estimación como si fuera una confirmación del backend.

Para que el navegador pueda abrir el canal, `CORS_ALLOWED_ORIGIN` debe ser el
origen real de Web (por ejemplo, `http://localhost:3005` si se cambió
`WEB_HOST_PORT`). Gateway y Realtime comparten esa configuración; cambiar sólo
el puerto publicado sin actualizar este valor bloquea el handshake de Socket.IO.

## Reabastecimiento operativo — Fase 4

`/operations/inventory` está disponible para `ADMIN` y `EMPLOYEE`. La pantalla
permite registrar `RECEIPT`, `ADJUSTMENT_IN` y `ADJUSTMENT_OUT` por sucursal;
no ofrece `PHYSICAL_SALE`, ya que una venta debe continuar pasando por Orders
y sus reservas. La BFF valida al actor, consulta la variante publicada en
Catalog mediante Gateway y construye el snapshot que Inventory conserva en su
propia base. Por ello el navegador no puede declarar un SKU, producto o
atributos arbitrarios al iniciar existencias de una variante nueva.

`CUSTOMER` no recibe el destino ni puede invocar la BFF. Inventory conserva su
auditoría, aplica la invariante `on_hand >= reserved` y publica el cambio por
su Outbox; el Dashboard ADMIN queda actualizado por el flujo Realtime de la
fase anterior.

## Variantes complejas — Fase 5

La pantalla `/catalog/manage` mantiene la combinación vendible en Catalog:
`sku`, `size`, `color` y `material` son campos independientes de una variante
y sólo `ADMIN` puede crearlos o modificarlos. La edición utiliza el contrato
existente `PATCH /variants/:id`; una variante se desactiva, nunca se elimina,
para preservar los snapshots de ventas ya confirmadas.

Los roles operativos no administran atributos: `EMPLOYEE` recibe la variante
publicada para registrar existencias y ventas, mientras `CUSTOMER` sólo ve
variantes activas del catálogo. Inventory continúa identificando el stock por
`variantId`, sin una FK hacia la base de Catalog.
