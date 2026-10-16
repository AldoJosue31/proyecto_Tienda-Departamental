# Revisión y demostración de requisitos

Fecha: 13 de octubre de 2026. Zona: America/Mexico_City.

La implementación cubre la mayoría de los requisitos y las 27 comprobaciones de integración terminaron correctamente en el entorno aislado. El entorno principal todavía no puede darse por completamente conforme: Inventario rechaza al administrador, varias imágenes no corresponden al código actual y CORS devuelve un error interno ante un origen no autorizado. También hay diferencias funcionales que deben explicarse al presentar el proyecto.

## Entornos revisados

| Entorno | Web | Gateway | Uso y resultado |
| --- | --- | --- | --- |
| Principal, proyecto `web` | http://localhost:3005 | http://localhost:8000 | Lecturas HTTP, sesiones temporales de prueba y revisión de contenedores. 25 contenedores saludables; Inventario devuelve 401 incluso para ADMIN. Correos en modo log. |
| Aislado, proyecto `departamental-five-phases` | http://localhost:3105 | http://localhost:8005 | Ventas, carreras, cupones, SMTP capturado y logística con datos sintéticos. 26 contenedores al incluir Mailpit. Se recuperó Precios, que estaba detenido desde el 11 de octubre a las 21:30 CDMX. |

Las pruebas que cambian existencias, pedidos y campañas se ejecutaron exclusivamente en el entorno aislado. No se reconstruyeron imágenes ni se cambiaron datos de negocio en el principal. El runner final reinició Notification en pruebas para verificar su recuperación. La bandeja SMTP de prueba está en http://localhost:18025.

## Matriz de cumplimiento

"Verificado en pruebas" acredita la ejecución aislada de hoy; no certifica automáticamente las imágenes del entorno principal. "Revisado en código" indica evidencia de implementación, sin atribuirle una demostración operativa que no se haya realizado.

| Requisito solicitado | Resultado de la revisión | Cómo demostrarlo y evidencia |
| --- | --- | --- |
| API Gateway único | Implementado y comprobado por HTTP. Next funciona como BFF; las APIs de los dominios pasan por Kong. Queda un scheduler heredado local de Next, ajeno al flujo principal. | Navegador → `/api/dashboard/*` → `gatewayJson` → Kong → servicio. Mostrar JSON en 8005, `src/lib/auth/gateway-client.server.ts` e `infra/kong/kong.yml.template`. |
| REST JSON y comunicación asíncrona | Implementado. APIs JSON, RabbitMQ, outbox, confirmación del broker, reintentos y DLQ. SMTP de cupones verificado hoy. | `/crm` → campaña pendiente → correo capturado en Mailpit → aceptación SMTP reflejada en CRM. [Verificación final](verification-final-phases.json). |
| Bases independientes | Revisado en código y Compose: nueve PostgreSQL de dominio; Realtime no requiere BD. Cruces por API o eventos. Hay BD/Redis heredados de Next, separados de las BD nuevas. | Mostrar dueños y conexiones en Compose, `orders-service/src/orders/inventory.client.ts` y `analytics-service/src/analytics/inventory-reconciliation.service.ts`. Los accesos directos de los runners a las BD son del arnés de pruebas. |
| Contenedores independientes | Implementado; procesos y Dockerfiles separados. El reinicio aislado de Notification conservó las entregas sin duplicar SMTP. | `docker compose ps`; para apagar un dominio durante la exposición usar únicamente el proyecto aislado y restaurarlo. Los flujos que dependen de él pueden degradarse, aunque los demás contenedores sigan activos. |
| CORS | Parcial. Origen permitido devuelve 200 y su ACAO correcto. Origen no autorizado no obtiene permiso de lectura, pero devuelve 500 en ambos entornos. | Ejecutar el auditor de HTTP. Corregir rechazo en `services/catalog-service/src/main.ts` y comprobar respuesta preflight y solicitudes normales antes de afirmar conformidad completa. |
| JWT y usuarios autorizados | Verificado en aislado: sin JWT → 401; CUSTOMER en APIs administrativas → 403; ADMIN → 200. Principal inconsistente: `/inventory` → 401 para ADMIN por Auth antiguo frente a guard nuevo. | Mostrar los reportes HTTP y comparar ADMIN/CUSTOMER. Alinear las versiones de Auth y los demás servicios en principal; comprobar revocación y roles después. |
| Atomicidad de última unidad | Verificada con PostgreSQL y dos órdenes físicas simultáneas: una sola confirmación y stock final cero. | [Prueba de integración](verification-five-phases.json), check `only one of two simultaneous physical orders buys the last unit`. La demo de dos ventanas acredita sincronización; el runner acredita la carrera real. |
| Caché Redis | Implementada y comprobada: búsquedas almacenadas con TTL; prueba unitaria demuestra que un HIT evita el repositorio SQL. Búsqueda 120 s, detalle 600 s por defecto. | Repetir `/products?search=aurora`, inspeccionar `catalog:search:*` y TTL en `catalog-redis`; mostrar `catalog.service.spec.ts`. Claves y contadores solos no prueban ausencia de SQL. |
| Precios dinámicos a las 00:00 | Verificado el límite temporal de cotización con reloj inyectado y PostgreSQL real. Inicio inclusivo, fin exclusivo; zona CDMX. Estado/eventos y pantalla pueden demorarse por intervalos de 30 s. | `/promotions` → zona America/Mexico_City → inicio 00:00. Mostrar prueba de frontera y precio del pedido confirmado/JSON de Pricing. Catálogo y total estimado usan precio de lista y no muestran automáticamente ese descuento. |
| Barras y pastel con Chart.js | Barras de stock presentes y visibles. La gráfica circular usa **Doughnut (anillo)**; falta Pie sin hueco si la rúbrica exige esa forma literal. | `/dashboard` → Existencias por sucursal y Stock por sucursal. `src/components/analytics-dashboard.tsx` registra Chart.js y usa Bar/Doughnut. |
| Inventario sincronizado en segundos | Verificado por socket y reconciliación. En la carrera de hoy: 935 ms de propagación evento→cliente; 1261 ms desde inicio de peticiones de venta hasta el evento observado. Es una medición, no una garantía máxima de latencia. | `/dashboard` abierto + última unidad vendida en `/operations/sales`, misma sucursal/variante → AGOTADO sin recargar. Socket reconectado pide snapshot; respaldo de 5 s cuando está desconectado. |
| Alertas de reabastecimiento | Implementadas y observadas en navegador: Atención prioritaria en rojo, `disponible <= punto de pedido`. También avisa al igualar el mínimo. | En `/operations/inventory`, dejar disponible 2 y punto 3 mediante un movimiento sintético; observar la alerta en `/dashboard`. |
| Talla, color y material | Revisado en esquema, API, UI y pruebas: campos por variante y SKU independiente. | `/catalog/manage` → crear/editar al menos dos variantes de la misma prenda, por ejemplo S/Azul/Algodón y M/Azul/Algodón. No depender de que las semillas actuales ya tengan varias variantes. |
| Ventas de hoy por sucursal | Implementado y visible en navegador. Analytics usa día calendario CDMX y proyecciones asíncronas. | Ventas de prueba en dos tiendas → `/dashboard` → Hoy → Ventas por sucursal. El reporte refresca cada 15 s. |
| Top de productos | Verificado ranking por producto que suma variantes: 6 + 6 supera a otro producto con 9. No hay ranking agregado por categoría. | `/dashboard` → Top 5/10/20. Si “zapatos, perfumes o electrónica” exige comparar categorías, falta ese reporte adicional. |
| Ticket promedio | Implementado y visible: importe de ventas completadas / número de tickets completados; no divide entre clientes únicos. | Mostrar KPI junto a ventas y cantidad de tickets del mismo periodo. La pantalla redondea su presentación. |
| Pick & Pack | Verificado por API y visible en UI: Pendiente → Empacando → Enviado → Entregado, control de versión y permisos. Ventas físicas no generan envío. | Compra online de prueba → `/operations` → Iniciar empaque → Marcar como enviado → Confirmar entrega. [Verificación final](verification-final-phases.json). |
| Mapas, repartidores y llegada | Código integra Google Maps JS, Routes y ubicaciones por API/socket. Ubicación y transición de entrega verificadas hoy; la llamada real a Google tiene evidencia del 8 de octubre y no se revalidó hoy. | `/operations` → asignar repartidor/destino → publicar señal sintética → mapa, ruta y antigüedad. Requiere claves, Map ID y referrer permitidos. No existe evidencia de una app móvil GPS desplegada ni entrega automática por proximidad. |
| CRM: historial | Verificado: el historial conserva el precio de compra confirmado, artículos y fechas; cancelados se excluyen. | `/crm` → perfil del cliente comprador → Historial de compras. Esperar proyección si el pedido acaba de completarse. |
| CRM: cupón a inactivos tres meses | Verificado: tres meses calendario CDMX, cliente antiguo incluido, reciente excluido; previsualización y confirmación recalculan destinatarios. Personas sin compras previas no entran en este segmento. | `/crm` → 3 meses → Preparar campaña → código/descuento/alcance/vigencia → Confirmar y enviar → Mailpit y contador SMTP. Usa datos sintéticos. |

## Demostración sugerida en la app

Usar ADMIN y CUSTOMER en sesiones separadas del entorno http://localhost:3105. La guía detallada con comandos está en [guia-demostracion-requisitos.md](guia-demostracion-requisitos.md).

1. **Catálogo:** mostrar SKU, talla, color y material de dos variantes del mismo producto en `/catalog/manage`.
2. **Stock:** preparar una unidad y un punto de pedido superior en `/operations/inventory`; dejar `/dashboard` visible y confirmar una venta en `/operations/sales`. Mostrar alerta y AGOTADO sin recargar. Guardar sucursal, variante y pedido de la prueba.
3. **Indicadores:** realizar ventas en dos sucursales; mostrar Hoy, barras de ventas y stock, anillo de distribución, Top y ticket promedio. Esperar la proyección; los datos de los runners incluyen fixtures sintéticos para ranking.
4. **Promoción:** mostrar inicio, fin y zona en `/promotions`. Para una transición breve programar unos minutos después; acreditar exactamente las 00:00 con el test de frontera. Comparar precio efectivo confirmado, no la tarjeta de precio de lista.
5. **Logística:** compra ONLINE → `/operations` → las tres columnas; asignar reparto, publicar coordenadas públicas de prueba con `publish-integration-location.mjs` y comprobar entrega. Las credenciales Google deben comprobarse antes de la exposición.
6. **CRM:** abrir historial; previsualizar inactivos de tres meses comparando cliente antiguo y reciente; campaña sintética y correo en Mailpit. Aceptación SMTP acredita que el servidor aceptó el mensaje, no lectura o recepción en Gmail.
7. **Arquitectura:** terminar con pruebas de carrera, Redis, JSON/JWT/CORS y Compose. La UI por sí sola no acredita atomicidad ni propiedad de las bases.

Los runners vencen promociones de pruebas previas y generan ventas/campañas: ejecutarlos **antes** de preparar una demostración manual, exclusivamente en el proyecto aislado. Las contraseñas de las cuentas semilla están en `.env.integration`; no se incluyen en documentos ni reportes.

## Evidencia de esta revisión

- **114 pruebas focalizadas aprobadas:** 36 frontend, 5 Analytics, 6 Logistics, 8 CRM, 19 de inventario/catálogo/precios/zona horaria y 40 de arquitectura/eventos/notificaciones/seguridad. Son unitarias, contratos o comprobaciones estáticas; no todas son E2E.
- **27 comprobaciones de integración aprobadas:** [14 de inventario, precios, Analytics, sincronización y CRM](verification-five-phases.json) y [13 de cupones, SMTP, recuperación y logística](verification-final-phases.json). Estos dos reportes se actualizaron con la ejecución del 13 de octubre.
- Auditoría HTTP/infraestructura: [principal](audit-runtime-business-2026-10-13.json) y [aislado](audit-runtime-integration-2026-10-13.json). Sus fallos deliberadamente conservados son CORS y, en principal, identidad de Inventario. Un healthcheck saludable no basta para validar una operación autorizada.
- Navegador actual: catálogo, dashboard, indicadores, alertas y Chart.js. [Captura de stock](screenshots/dashboard-stock-2026-10-13.jpg) y [cabecera de dashboard](screenshots/dashboard-2026-10-13.jpg). Las otras capturas y `verification-browser.json` conservan su fecha anterior; no se presentan como nuevas pruebas UI de todo el flujo.
- Compilación local de siete servicios aprobada para ejecutar los runners. No se hizo una nueva compilación/despliegue de todo el entorno principal.

Para repetir las comprobaciones HTTP sin ventas ni ajustes:

```powershell
Set-Location 'C:/Users/Aldo/Documents/Proyectos/ApliacionWeb/web'
node scripts/audit-requirements.mjs
node scripts/audit-requirements.mjs --business
```

El auditor usa HTTP GET, sesiones de autenticación temporales y lecturas de Docker/Redis; calienta la caché con dos búsquedas y cierra las sesiones que crea. Guarda resultados fechados en CDMX, sin tokens ni contraseñas, y termina con código 1 si detecta fallos.

## Pendientes antes de declarar cumplimiento completo

1. **Alinear despliegue principal:** Auth y servicios de negocio deben usar versiones compatibles. Verificar que ADMIN acceda a Inventario y que CUSTOMER reciba 403, y comprobar deshabilitación de identidades después del despliegue.
2. **Corregir CORS500:** el origen indebido ya no obtiene acceso en navegador, pero debe manejarse sin error interno. Revalidar GET y OPTIONS.
3. **Correo en principal:** configurar SMTP si se exige envío real. El modo log solo demuestra simulación; el aislado sí acredita SMTP capturado.
4. **Interpretación literal de gráficos y Top:** sustituir anillo por Pie si se exige pastel sin hueco; añadir ranking por categoría si se exige zapatos/perfumes/electrónica agregados.
5. **Precio antes de confirmar:** si se espera visualizar descuentos programados en catálogo/estimado, falta cotizar ese precio en esas pantallas. El pedido confirmado ya usa Pricing.
6. **Maps actual y operación continua:** revalidar Google y origen, y revisar el fallo de conexión que detuvo Precios. Encenderlo recuperó la demo, pero no corrige la causa ni aporta garantía de reinicio automático.

Además, el scheduler heredado en Next no representa la arquitectura nueva y admite llamadas si `SCHEDULER_SECRET` no está definido. En el entorno principal la llamada sin secreto devolvió 401; conviene retirar el legado o exigir configuración al arrancar.
