# Guía para demostrar los requisitos de la tienda departamental

Esta guía organiza una exposición de aproximadamente 25 a 30 minutos. Cubre la sección B Tienda Departamental de `Proyectos App Web.docx`, los requisitos técnicos generales y los requisitos técnicos específicos de esa tienda en `Requerimientos Técnicos Generales.docx`. Los apartados de clínica y red social corresponden a otros proyectos. CORS y JWT son opcionales en el Word; también se pueden demostrar porque están implementados.

La demostración combina operaciones visibles, resultados esperados y pruebas técnicas. Las capturas y los reportes enlazados documentan la verificación del 8 de octubre de 2026; para acreditar una nueva ejecución, conserva también sus resultados y fecha.

## Preparar el entorno

Al preparar esta guía, Docker Desktop estaba detenido. Ábrelo y espera a que su motor esté disponible. Usa el entorno de pruebas que ya tiene datos sintéticos y Mailpit para capturar correos.

En PowerShell:

```powershell
Set-Location 'C:/Users/Aldo/Documents/Proyectos/ApliacionWeb/web'
$env:Path = 'C:/Users/Aldo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin;' + $env:Path
docker info --format '{{.ServerVersion}}'
node scripts/setup-integration.mjs
$demoArgs = @('-p', 'departamental-five-phases', '--env-file', '.env.integration', '-f', 'compose.yaml', '-f', 'compose.integration.yaml')
docker compose @demoArgs up -d --wait
docker compose @demoArgs ps
```

La configuración existente se conserva. Si Docker indica que faltan imágenes, repite `up` agregando `--build`. No borres volúmenes para preparar la exposición.

Abre estas direcciones:

| Recurso | Dirección |
| --- | --- |
| Aplicación de demostración | http://localhost:3105 |
| Gateway de demostración | http://localhost:8005 |
| Bandeja de captura SMTP | http://localhost:18025 |

Los puertos 3005 y 8000 pertenecen al entorno de negocio. Las ventas, ajustes de stock, campañas y paradas indicadas aquí se realizan exclusivamente en el proyecto `departamental-five-phases`.

Ten disponibles dos sesiones de navegador: una de administrador y otra de cliente. Los usuarios iniciales son `admin@departamental.local`, `employee@departamental.local` y `customer@departamental.local`. Sus contraseñas de este entorno están en las variables `SEED_ADMIN_PASSWORD`, `SEED_EMPLOYEE_PASSWORD` y `SEED_CUSTOMER_PASSWORD` de `.env.integration`; no presupongas que son las contraseñas por defecto.

## Matriz de requisitos y evidencia

| Requisito original | Qué hacer o mostrar | Resultado que acredita cumplimiento |
| --- | --- | --- |
| Sincronización total del inventario | Mantener `/dashboard` abierto y vender la última unidad desde `/operations/sales` en otra sesión. | El disponible pasa a cero y aparece AGOTADO sin recargar el dashboard. |
| Alertas de reabastecimiento | Definir punto de pedido y llevar el disponible por debajo de él desde `/operations/inventory`. | La variante aparece en la sección roja Atención prioritaria con disponible y punto de pedido. |
| Variantes por talla color y material | Abrir `/catalog/manage` y mostrar dos variantes del mismo producto. | Cada variante conserva atributos y SKU propios; una venta afecta la variante seleccionada. |
| Ventas por sucursal | Realizar ventas de prueba en dos sucursales y elegir Hoy en `/dashboard`. | La gráfica compara las ventas de ambas sucursales para el periodo elegido. |
| Top de productos | Mostrar el ranking después de ventas de varias variantes del mismo producto. | El producto aparece agrupado; la prueba técnica acredita que 6 + 6 unidades superan a otro producto con 9. |
| Ticket promedio | Comparar el indicador con el total y el número de pedidos contabilizados del periodo. | Ticket promedio = importe vendido / número de pedidos contabilizados, con la moneda y el periodo mostrados. |
| Pick and Pack | Crear un pedido online y abrir `/operations`. | El pedido pasa por Pendiente, Empacando y Enviado; después puede confirmarse su entrega. |
| Rutas y seguimiento | Asignar repartidor y dirección, publicar una ubicación de prueba y abrir el seguimiento. | Se muestran repartidor, destino, ruta, última señal y estado de entrega. |
| Historial de compras | Abrir al cliente en `/crm` después de una compra. | Aparecen artículos, fechas e importes del pedido confirmado, conservando su precio histórico. |
| Cupón solo para clientes inactivos por tres meses | Previsualizar el segmento de 3 meses, comparar un cliente antiguo con otro reciente y confirmar una campaña. | El antiguo elegible aparece; el reciente queda excluido. Mailpit captura el correo con código y vigencia. |
| API Gateway | Mostrar la ruta de llamadas desde la UI a Next.js y de Next.js a Kong; consultar JSON en el puerto 8005. | Kong deriva las rutas a Auth, Catalog, Inventory, Pricing, Orders y los demás servicios. |
| REST y comunicación asíncrona | Mostrar una respuesta JSON y una campaña que primero queda pendiente y luego aceptada por SMTP. | Las APIs devuelven JSON; RabbitMQ y los consumidores procesan los eventos de campaña y entrega. |
| Bases independientes | Mostrar los PostgreSQL separados y ejemplos de clientes API entre servicios. | Cada dominio tiene su propia base; Orders llama APIs de Catalog, Pricing e Inventory y Analytics obtiene Inventory por API privada. |
| Contenedores independientes | Mostrar `docker compose ps`; detener y restaurar solo Analytics en el entorno de prueba. | Los otros contenedores siguen activos y el catálogo sigue disponible. El reporte puede señalar indisponibilidad temporal. |
| Atomicidad de la última unidad | Ejecutar `verify-five-phases.mjs` y mostrar su prueba de dos órdenes simultáneas. | Solo una compra se confirma, la otra recibe falta de stock y el stock final es cero. |
| Caché de productos en Redis | Repetir la misma consulta y mostrar las claves de búsqueda de `catalog-redis`. | Redis contiene respuestas con vigencia; la prueba de Catalog comprueba que un acierto evita consultar PostgreSQL. |
| Descuento programado a las 00 horas | Mostrar una promoción con zona America/Mexico_City y ejecutar la prueba de límites temporales. | Antes del inicio se cobra precio normal, a las 00:00 aplica el descuento y al vencer deja de aplicarse. |
| Barras y pastel con Chart.js para stock | Mostrar las dos gráficas de stock por sucursal en `/dashboard` y su implementación en `analytics-dashboard.tsx`. | Las gráficas de barras y distribución circular usan los mismos datos de stock y Chart.js. |
| CORS y JWT opcionales | Comparar una operación como ADMIN con la misma operación como CUSTOMER o sin sesión. | El backend permite la operación autorizada y rechaza acceso indebido; los orígenes permitidos se configuran en Kong. |

## Orden sugerido para la exposición

### 1 Catálogo e inventario

Entra como administrador. En Gestionar catálogo, muestra una prenda con dos variantes y sus campos talla, color, material y SKU. Anota qué variante y sucursal utilizarás.

En Inventario (`/operations/inventory`), usa Nuevo movimiento para recibir o ajustar existencias del artículo de prueba y definir su punto de pedido. Por ejemplo, disponible 2 y punto de pedido 3 permiten mostrar una alerta por estar por debajo del mínimo. Los ajustes son incrementos o decrementos: calcula la cantidad necesaria a partir del stock mostrado; no introduzcas el saldo final como si fuera un incremento.

Abre Administración (`/dashboard`) en otra ventana. Muestra Atención prioritaria y los valores de físico, reservado y disponible. Deja después una unidad disponible del artículo de prueba, sin reservas abiertas.

### 2 Última unidad y actualización automática

En Ventas físicas (`/operations/sales`), elige esa misma sucursal y variante y confirma una venta de una unidad. Mantén visible el dashboard, sin pulsar Actualizar. Graba el cambio de 1 a 0 y AGOTADO.

La demostración manual acredita la actualización; la carrera entre dos compradores se acredita con la prueba automatizada de la sección siguiente. Conserva el identificador de la venta. La [captura anterior](screenshots/physical-sale-exhausted.jpg) sirve como respaldo.

### 3 Indicadores y promoción

Realiza otra venta sintética en una sucursal diferente. En Administración selecciona Hoy y muestra ventas por sucursal, Top productos, ticket promedio y las dos gráficas de stock. Analytics es una proyección asíncrona: espera su actualización o usa Actualizar para el reporte. La actualización de las gráficas se consulta cada 15 segundos; no atribuyas ese mismo intervalo a los eventos de inventario.

En Promociones (`/promotions`), muestra descuento, alcance, zona, inicio y fin. Para demostrar visualmente una transición rápida puedes programar una promoción unos minutos después; para acreditar exactamente las 00:00 utiliza la prueba de límites temporales. No cambies la hora del sistema ni esperes hasta medianoche durante la exposición.

La [captura del dashboard](screenshots/dashboard-verified.jpg) y la [captura de promociones](screenshots/promotions.jpg) respaldan estos pasos.

### 4 Compra online y preparación

En la sesión del cliente, añade al carrito un artículo con existencias de prueba y confirma el pedido. Anota su identificador. En la sesión del administrador o empleado, abre Operación (`/operations`), localiza ese pedido y pulsa Iniciar empaque y posteriormente Marcar como enviado.

Muestra las tres columnas del tablero y el historial de cambios. Configura el reparto con nombre, UUID y una dirección pública de prueba. Después publica una ubicación para ver mapa, ruta y destino. La ubicación es una señal de prueba emitida mediante API; esto no supone que exista una aplicación móvil de GPS desplegada.

Puedes generar el UUID del repartidor en PowerShell y pegarlo en el formulario:

```powershell
$courierId = [guid]::NewGuid().ToString()
$courierId
```

Obtén el UUID del envío desde la petición de detalle del tablero en las herramientas de desarrollo del navegador. Usa el ID del envío, no el ID del pedido. En el mismo PowerShell:

```powershell
$shipmentId = 'UUID_DEL_ENVIO'
node scripts/publish-integration-location.mjs $shipmentId $courierId 0
```

El helper valida el proyecto aislado y publica coordenadas públicas en Ciudad de México. Maps y Routes necesitan las claves locales habilitadas y el origen `http://localhost:3105` autorizado. Una captura de un mapa anterior no sustituye una nueva prueba si esas credenciales cambian.

Para mostrar una señal antigua, utiliza un envío nuevo sin una señal posterior y publica primero edad 600; luego publica edad 0. Las ubicaciones antiguas se descartan cuando ya existe una señal más reciente.

```powershell
node scripts/publish-integration-location.mjs $shipmentId $courierId 600
node scripts/publish-integration-location.mjs $shipmentId $courierId 0
```

Finalmente pulsa Confirmar entrega y muestra el estado entregado. [Mapa verificado](screenshots/tracking-map.jpg).

### 5 Historial y campaña CRM

En CRM (`/crm`), abre al cliente que compró y muestra su pedido, artículos e importe. El historial se actualiza después de procesar el evento; espera si la compra es reciente. [Historial verificado](screenshots/crm-history.jpg).

Para la segmentación necesitas datos sintéticos con una compra de hace más de tres meses y otro cliente con compra reciente. `verify-final-phases.mjs` prepara clientes y compras históricas de prueba en el entorno aislado. No envejezcas las compras del entorno de negocio para conseguir destinatarios.

Selecciona 3 meses y muestra la vista previa. Confirma que el comprador reciente no está incluido. Define código nuevo, descuento, alcance y vigencia futura; confirma la campaña. El entorno de integración publica el outbox de CRM cada 60 segundos: durante ese intervalo puede aparecer pendiente.

Abre Mailpit (`http://localhost:18025`) y muestra el correo correspondiente, destinatario, código y vigencia. Vuelve a CRM para mostrar Aceptados por SMTP. Esta evidencia acredita aceptación por el servidor SMTP de prueba; no acredita recepción en Gmail ni lectura del destinatario. En el modo log del entorno de negocio, el estado correcto es Simulado.

Como ampliación del Word puedes canjear el cupón con el cliente elegible en checkout y mostrar la reducción del total. El Word original exige envío y segmentación, pero no define el canje. [Campaña SMTP](screenshots/crm-smtp.jpg) y [compra con descuento](screenshots/checkout-confirmed.jpg).

## Pruebas técnicas durante la exposición

### Concurrencia y límites de tiempo

Desde `web`, con el entorno aislado saludable, compila primero los módulos que importan los runners:

```powershell
foreach ($service in @('inventory', 'analytics', 'pricing', 'crm', 'notification', 'orders')) {
    npm --prefix "services/$service-service" run build
    if ($LASTEXITCODE -ne 0) { throw "Falló la compilación de $service" }
}
node scripts/verify-five-phases.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló la verificación de las fases 1 a 5' }
node scripts/verify-final-phases.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló la verificación de las fases 6 a 8' }
```

Los runners escriben fixtures, crean campañas, ejecutan ventas y recuperaciones en el entorno aislado. El primer runner también vence las promociones de prueba anteriores para evitar interferencias. Ejecútalos antes de preparar las promociones que presentarás manualmente.

Muestra especialmente estas líneas de aceptación:

- `only one of two simultaneous physical orders buys the last unit`
- `Pricing applies midnight and expiration before its scheduler catches up`
- `real PostgreSQL ranking sums two variants into one product`
- `campaign preview and confirmation recalculate recipients and deduplicate`
- `coupon right exists before real SMTP capture and accepted status reaches CRM`
- `logistics tracks packing, courier location, dispatch and delivery with role restrictions`

Los resultados se guardan en [verification-five-phases.json](verification-five-phases.json) y [verification-final-phases.json](verification-final-phases.json). Los runners usan puertos de PostgreSQL de prueba para sus fixtures e inspecciones; ese acceso pertenece al arnés de pruebas, no a la comunicación de los microservicios de producción.

### Caché real de Redis

Consulta dos veces exactamente la misma búsqueda a través de Kong y muestra las claves de caché:

```powershell
$searchUrl = 'http://localhost:8005/products?search=aurora'
Invoke-RestMethod $searchUrl | Out-Null
Invoke-RestMethod $searchUrl | Out-Null
docker compose @demoArgs exec -T catalog-redis redis-cli --scan --pattern 'catalog:search:*'
docker compose @demoArgs exec -T catalog-redis redis-cli INFO stats | Select-String 'keyspace_hits|keyspace_misses'
npm --prefix services/catalog-service test -- test/catalog.service.spec.ts
```

Las claves acreditan respuestas almacenadas; los contadores por sí solos no prueban ausencia de lecturas SQL. La prueba `serves a valid cached search without reading PostgreSQL` verifica que el repositorio no se invoca cuando la respuesta está en caché.

Si necesitas una comprobación adicional con infraestructura real, calienta esa búsqueda y detén solamente PostgreSQL Catalog durante unos segundos. Haz la misma consulta inmediatamente, dentro de la vigencia de la caché, y restaura la base al terminar:

```powershell
Invoke-RestMethod $searchUrl | Out-Null
try {
    docker compose @demoArgs stop catalog-postgres
    Invoke-RestMethod $searchUrl | ConvertTo-Json -Depth 6
} finally {
    docker compose @demoArgs start catalog-postgres
}
```

Resultado esperado: la búsqueda previamente almacenada responde aun con su base detenida. Una consulta distinta que no esté en caché puede fallar mientras PostgreSQL esté detenido; no la utilices para este paso.

### Gateway bases y contenedores

Muestra `docker compose @demoArgs ps` y `docker compose @demoArgs config --services`. Las llamadas del navegador pueden ir a `/api/...` de Next.js; el BFF las envía a Kong. La prueba del punto único de entrada incluye revisar `src/lib/auth/gateway-client.server.ts` y las rutas de `infra/kong/kong.yml.template`, no exigir que todas las llamadas del navegador tengan el puerto 8005 visible.

Para explicar bases independientes, muestra los contenedores `auth-postgres`, `catalog-postgres`, `inventory-postgres`, `pricing-postgres`, `orders-postgres`, `analytics-postgres`, `logistics-postgres`, `crm-postgres` y `notification-postgres`. Completa la explicación con `services/orders-service/src/orders/pricing.client.ts` y `services/analytics-service/src/analytics/inventory-reconciliation.service.ts`: sus cruces de dominio son por API. La lista de contenedores sola no prueba que un servicio jamás consulte una base ajena.

Para demostrar aislamiento operativo:

```powershell
try {
    docker compose @demoArgs stop servicio-analitica
    docker compose @demoArgs ps
    Invoke-RestMethod 'http://localhost:8005/products' | Out-Null
} finally {
    docker compose @demoArgs start servicio-analitica
}
```

RabbitMQ y los outbox permiten mostrar comunicación asíncrona mediante la campaña y sus estados. Si se necesitan detalles técnicos, presenta los publishers y consumidores y los resultados de recuperación; evita exponer valores de variables de entorno o tokens en la grabación.

## Evidencia para entregar

Prepara una carpeta o presentación con una fila por requisito de la matriz, la acción realizada, el resultado y su captura o salida de prueba. Una imagen de la pantalla inicial no acredita una transición: para inventario, promoción y logística utiliza antes y después o una grabación breve.

Incluye:

1. Grabación de la última unidad vendida y AGOTADO sin recarga.
2. Capturas de variantes, alerta roja, gráficas, promoción y tres columnas de preparación.
3. Mapa con repartidor, ruta, destino y confirmación de entrega.
4. Historial del cliente, segmento de 3 meses y mensaje capturado en Mailpit.
5. Salidas PASS de las pruebas de concurrencia, medianoche y segmentación; evidencia de Redis y contenedores separados.
6. [PR 3 fusionado](https://github.com/AldoJosue31/proyecto_Tienda-Departamental/pull/3) y los controles aprobados de GitHub Actions.

La verificación registrada incluye 188 pruebas unitarias, 27 comprobaciones de integración y nueve de navegador. Consulta [el informe final](implementacion-fases-6-8.md) para los límites de SMTP y las dependencias de Maps. No presentes una captura SMTP local como envío probado a una dirección real.
