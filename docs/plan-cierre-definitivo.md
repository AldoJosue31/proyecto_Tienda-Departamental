# Plan por fases para el cierre integral de la tienda departamental

Fecha: 13 de octubre de 2026. Estado: **fases 1 a 6 cerradas en el entorno aislado con alcance universitario; fases 7 a 9 pendientes**.

Referencia inicial: [revisión de requisitos](revision-requisitos-2026-10-13.md). El [informe de cierre de las fases 1 a 3](implementacion-cierre-fases-1-3.md), el [resumen verificable](verification-fases-1-3-summary.json) y el [procedimiento de recuperación](recuperacion-cierre-fases-1-3.md) documentan la entrega `fases-1-3-20261013-86397846056e`. Este plan es la referencia para los pendientes actuales; el [plan anterior](plan-cumplimiento-requisitos.md) conserva el historial.

## Resultado que se debe entregar

Una app operable para ADMIN, EMPLOYEE y CUSTOMER, con todos los requisitos solicitados implementados, comprobados en infraestructura real y funcionando en la versión desplegada en el entorno principal. Cada requisito debe tener una prueba reproducible, evidencia actual y un recorrido claro desde la interfaz.

La candidata actual pasó **358 pruebas de los once proyectos, 101 comprobaciones de integración/auditoría y nueve recorridos de navegador**, además de una comprobación del mapa con teselas reales. Las fases 4–6 están documentadas en el [informe de cierre](implementacion-cierre-fases-4-6.md) y el [resumen verificable](verification-fases-4-6-summary.json). Incluyen pastel literal, categorías, ambos grupos CRM, SMTP local, canje de cupón y reparto móvil con recuperación de red/GPS. El [manifiesto actual](release-fases-4-6.json) conserva 24 contenedores compatibles y 29 migraciones; 18 ensayos de migración preservaron los datos de los dos checkpoints con las mismas imágenes de servicios. El principal conserva sus 25 contenedores anteriores hasta la fase 9. CI está preparado y no se ejecutó remotamente.

El objetivo principal es el proyecto local `web`, actualmente en http://localhost:3005 con Gateway 8000. La certificación destructiva usa `departamental-five-phases`, web 3105, Gateway 8005 y Mailpit 18025.

**Alcance universitario confirmado por el usuario:** «No tengo, solo es un proyecto universitario», tanto para SMTP externo como para HTTPS/teléfono. Se acepta correo real capturado por SMTP local en Mailpit, mapa interactivo OpenStreetMap y reparto con posiciones ficticias claramente identificadas; GPS del navegador se valida mediante emulación y permisos. No se requiere contratar un proveedor, crear un dominio ni certificar GPS en un teléfono físico. Google Routes y el acceso real por HTTPS quedan como opciones para una ampliación posterior, sin bloquear este cierre ni atribuirles pruebas inexistentes.

## Orden y dependencias

| Fase | Entrega | Depende de |
| --- | --- | --- |
| 1 | Versión compatible, respaldo y migraciones comprobadas | Base de todo el cierre |
| 2 | Seguridad, Gateway, aislamiento y recuperación operativa | 1 |
| 3 | Precios efectivos visibles y promociones completas | 1–2 |
| 4 | Dashboard con pastel, productos y categorías | 1–2 |
| 5 | CRM, segmentación completa y correo operativo | 1–2; 3 para canje integrado |
| 6 | Pick & Pack, mapa interactivo y reparto web móvil universitario | 1–2 |
| 7 | Inventario, variantes y recorridos de venta completos | 3–6 |
| 8 | Certificación integral, recuperación y CI | 1–7 |
| 9 | Despliegue principal, verificación y entrega final | 8 |

Después de la fase 2, las fases 3–6 pueden avanzar con proveedores locales para la demostración universitaria. El cierre de una fase exige pruebas aprobadas y evidencia; una casilla marcada por implementación solamente no acredita que esté lista.

## Fase 1. Preparar una versión compatible y preservar los datos

**Problema:** el principal combina Auth antiguo con validadores nuevos; Inventario devuelve 401 al administrador. Las migraciones del módulo de cuentas solo se probaron en el entorno aislado.

Trabajo:

- [x] Registrar la versión del código, imágenes y migraciones de web, Kong y los diez servicios en un manifiesto de entrega.
- [x] Construir y validar como conjunto compatible Auth, Notification, Catalog, Inventory, Pricing, Orders, Logistics, CRM, Analytics y Realtime.
- [x] Verificar contratos de identidad, claim `uv`, estado de usuario, secretos internos, redes y URLs. Ningún consumidor debe depender de una ruta ausente en Auth.
- [x] Generar respaldos recientes de todas las bases afectadas; ampliar la cobertura del helper actual, que solo respalda Auth y Notification.
- [x] Definir un punto de recuperación consistente entre bases y mensajes: pausar escrituras, schedulers, publicadores y consumidores de forma coordinada, esperar operaciones activas y registrar checkpoints, o aplicar un mecanismo equivalente probado. Preservar RabbitMQ en estado consistente o demostrar su reconstrucción desde outboxes/eventos conservados con sus IDs y ledgers; no combinar bases antiguas con un broker posterior sin reconciliación.
- [x] Restaurar los respaldos en un entorno temporal y ensayar migraciones sin pérdida de IDs, usuarios, roles, hashes, sesiones, pedidos, stock, promociones, envíos, historial y campañas.
- [x] Ensayar restauración con venta, reserva y correo pendientes; comprobar conservación del trabajo, ausencia de doble venta/reposición y tratamiento documentado de mensajes ya aceptados por SMTP. Un reinicio o restauración no convierte SMTP en entrega garantizada exactamente una vez.
- [x] Comprobar que aplicar otra vez las migraciones no duplica datos ni modifica registros ya migrados.
- [x] Ensayar recuperación coordinada de imágenes y esquema. Una restauración antigua no debe descartar escrituras posteriores; prever una ventana de actualización y preservación de cambios si la reversión lo requiere.

**Criterio de cierre:** conjunto compatible ejecutándose en aislado; ADMIN accede a Inventario; CUSTOMER recibe 403 en administración; identidades existentes pueden iniciar sesión. Las sesiones heredadas se renuevan o piden nueva autenticación de forma clara. Hay respaldo y restauración conjunta de datos/mensajes comprobados, incluidos trabajos pendientes. El despliegue definitivo del principal se realiza en la fase 9.

**Entrega:** manifiesto, informe de migraciones, respaldo privado y procedimiento probado de actualización/recuperación.

## Fase 2. Cerrar seguridad, arquitectura y estabilidad

**Problemas:** CORS500, scheduler de negocio heredado en Next y caída de Precios que requirió arranque manual.

Trabajo:

- [x] Unificar la política CORS de Kong y servicios: orígenes explícitos, métodos/cabeceras necesarios y cookies donde corresponda. Rechazar un origen indebido sin 500; probar GET, POST, OPTIONS y Socket.IO.
- [x] Mantener diferenciados autenticación 401, autorización 403, validación 400/422 y conflicto 409. El BFF debe mostrar mensajes comprensibles y conservar el identificador de correlación.
- [x] Comprobar JWT, renovación, expiración, CSRF de las mutaciones con cookies y acceso a pedidos propios. Deshabilitar una identidad debe bloquear APIs y socket dentro del límite documentado de 35 s; habilitarla no revive las sesiones revocadas.
- [x] Retirar `/api/internal/run-scheduler`, su script y la ejecución local de inventario/precios. Consolidar las tareas de negocio en sus servicios propietarios.
- [x] Inventariar consumidores y datos del PostgreSQL/Redis heredado de Next. Retirarlos del perfil activo después de confirmar que no contienen datos únicos necesarios, conservando respaldos y volúmenes recuperables.
- [x] Comprobar que cada servicio solo tiene credenciales de su base y que los cruces de dominio usan API/eventos. Separar la conectividad a APIs de la conectividad a PostgreSQL cuando las redes compartidas permitan alcanzar bases ajenas innecesariamente.
- [x] Reproducir la caída de Precios y corregir su causa: manejo de errores del Pool, publishers y temporizadores, recuperación de conexiones y excepciones no controladas. Las causas observadas en código son hipótesis hasta reproducir el fallo.
- [x] Añadir políticas apropiadas de reinicio y distinguir proceso caído de proceso vivo pero `unhealthy`; validar readiness y dependencias sin encadenar reinicios de todo el sistema.
- [x] Verificar outbox, reentregas, deduplicación, reintentos y DLQ. Investigar los mensajes pendientes de la DLQ de Analytics y aplicar una recuperación controlada, sin purgarlos como sustituto de corregir la causa.

**Criterio de cierre:** auditor HTTP aprobado en la versión candidata; sin JWT → 401, rol indebido → 403, ADMIN autorizado → 200. CORS no produce 500 ni habilita orígenes indebidos. Precios se recupera tras caída de PostgreSQL o RabbitMQ. Detener Analytics o Notification no detiene ventas ni catálogo; al restaurar el servicio procesa sus pendientes. La web opera mediante BFF→Kong→servicios y no ejecuta negocio heredado.

**Entrega:** contratos de seguridad, Compose definitivo, pruebas de fallos y procedimiento para recuperar colas/servicios.

## Fase 3. Mostrar el precio efectivo en toda la compra

**Problema:** Orders aplica Pricing al confirmar, pero catálogo y checkout estimado presentan precio de lista.

Trabajo:

- [x] Añadir cotización acotada por lote en Pricing para evitar una solicitud por cada tarjeta o variante. Obtener producto y precio base de Catalog mediante API; no confiar en importes enviados por el navegador.
- [x] Componer las cotizaciones desde BFF/Gateway para catálogo, detalle de variantes, carrito, checkout y venta física.
- [x] Mostrar precio de lista, precio vigente, ahorro y promoción aplicable. Recalcular con variante, cantidad y cupón; mostrar estado de cotización pendiente o fallida sin presentar un precio antiguo como vigente.
- [x] Actualizar al inicio y fin de promociones y al recuperar foco/conexión. No conservar en Redis un precio efectivo más allá del próximo límite temporal; mantener separados caché de catálogo y beneficios específicos de cliente.
- [x] Validar en servidor la cotización mostrada al confirmar. Si cambió el importe, informar el nuevo total y solicitar nueva confirmación antes de crear el pedido; conservar la idempotencia de los pedidos ya aceptados.
- [x] Conservar reglas de descuentos y cupones existentes: mejor beneficio según la regla documentada, sin duplicar descuentos, snapshot histórico y restitución del derecho cuando corresponde.
- [x] Mantener America/Mexico_City como zona de negocio: inicio inclusivo a las 00:00 y fin exclusivo. El precio debe ser correcto aunque el scheduler todavía no cambie el estado de la promoción.

**Criterio de cierre:** a la misma hora, mismos artículos/cantidades producen el mismo importe en cotización, UI y pedido confirmado. Pruebas en 23:59:59.999, 00:00:00 y vencimiento; navegador en otra zona no desplaza la campaña. Un reintento de pedido confirmado devuelve el mismo snapshot sin consumir stock o cupón nuevamente.

**Entrega:** API de cotización por lote, pantallas actualizadas y pruebas temporales/E2E de precios.

## Fase 4. Completar los reportes exigidos

**Problemas:** el gráfico circular es Doughnut y no existe ranking agregado por categorías.

Trabajo:

- [x] Sustituir la distribución circular por `Pie` de Chart.js sin hueco, conservando las barras de stock.
- [x] Añadir Top categorías junto a Top productos; permitir comparar unidades e importe con etiquetas explícitas y los periodos Hoy/7 días/30 días.
- [x] Guardar `categoryId` en Analytics. Orders ya lo publica; Analytics actualmente lo descarta. Añadir nombre de categoría como snapshot para ventas nuevas o resolverlo por Catalog API por lote según el contrato definido.
- [x] Migrar/reconciliar histórico mediante Orders/Catalog APIs o reejecución controlada de eventos. No leer las bases ajenas. Identificar datos históricos incompletos sin inventar categorías o nombres de la fecha de compra.
- [x] Mantener agrupación por producto sumando variantes, exclusión de cancelaciones, sucursales sin ventas, moneda y periodos CDMX consistentes.
- [x] Comprobar ticket promedio = ventas completadas / tickets completados; mostrar periodo, importe total y cantidad de tickets para verificarlo.
- [x] Añadir alternativas textuales/tabulares a las gráficas y estados de carga, ausencia de datos o proyección retrasada.

**Criterio de cierre:** ventas sintéticas en dos sucursales acreditan barras y pastel con totales iguales al stock oficial. Dos variantes que venden 6+6 aparecen como un producto de 12, por encima de otro con 9; el ranking de categorías suma correctamente sus productos. Cancelar una venta corrige importe, ranking y ticket una sola vez.

**Entrega:** migración de Analytics, contratos/BFF, Dashboard y fixtures reproducibles.

## Fase 5. Completar CRM y entrega de correos

**Problemas:** principal utiliza modo log y el segmento actual excluye a personas que nunca compraron.

Trabajo:

- [x] Configurar SMTP local hacia Mailpit, remitente de prueba y URLs del entorno correctas. Preparar una captura local equivalente para el principal en la fase 9.
- [x] Verificar confirmación de correo de cliente, invitación de empleado y campañas por RabbitMQ→Notification→SMTP. Diferenciar Pendiente, Aceptado por SMTP, Simulado y Fallido.
- [x] Verificar mensaje, enlace/código, destinatario y vigencia en Mailpit; reintentos limitados y recuperación de servicios, utilizando datos sintéticos.
- [x] Completar el historial del cliente con artículos, variantes, fechas, importes y snapshot del descuento; relacionar identidad por API/eventos de Auth y excluir cancelaciones correctamente.
- [x] Mantener el segmento de compradores cuya última compra sea anterior al corte de tres meses calendario CDMX, con su regla de frontera explícita.
- [x] Incorporar un subgrupo visible de clientes sin compras, con antigüedad de alta de al menos tres meses, para cubrir inactividad sin mezclar altas recientes. Auth suministra fecha de alta e identidad mínima mediante API/eventos; CRM no consulta su BD.
- [x] Mostrar ambos subgrupos y su total en la vista previa; validar elegibilidad al confirmar contra Orders API por lote o una reconciliación con cobertura acreditada. Definir y registrar el instante de referencia en que se fijan los destinatarios: una compra completada entre vista previa y ese instante excluye al cliente incluso si su evento todavía no llega a CRM. No basta consultar otra vez una proyección atrasada ni se promete una transacción atómica entre todas las bases.
- [x] Completar campaña→derecho de cupón→correo→canje en checkout con descuento visible. Doble clic/reintento no duplica campaña, destinatarios ni derecho.

**Criterio de cierre:** comprador antiguo elegible, comprador reciente excluido incluso con su evento CRM deliberadamente retrasado, alta antigua sin compras identificada en su subgrupo y alta reciente excluida. Cupón válido reduce el importe; ajeno/vencido/usado se rechaza. Mailpit acepta el mensaje SMTP y permite comprobar destinatario, contenido, código/enlace y vigencia; los estados no atribuyen lectura ni recepción externa a la aceptación SMTP local.

**Entrega:** segmento completo, UI de CRM, configuración SMTP local y evidencia de flujos de cuentas/cupones.

La confirmación de compra por email fue un ejemplo en el requisito de asincronía. La confirmación de correo de cuentas y los cupones ya cubren procesamiento pesado por cola; un email adicional de compra se registra como ampliación separada, sin convertirlo en requisito oculto de este cierre.

## Fase 6. Hacer operativo el reparto y los mapas

**Problemas:** mapa/ruta dependen de configuración externa; la ubicación se publica por API manual y la asignación pide UUID libre.

Trabajo:

- [x] Incorporar mapa OpenStreetMap interactivo con atribución y destino/segmento ficticios etiquetados para la demostración. Conservar Google/Routes como opción y su clave en servidor.
- [x] Crear vínculo de cuenta EMPLOYEE con repartidor y asignación operable mediante selector de personas habilitadas, sin exigir copiar UUID.
- [x] Incorporar una pantalla web móvil autenticada para reparto: envíos asignados, iniciar/detener publicación de ubicación y confirmar entrega autorizada.
- [x] Publicar ubicación desde esa pantalla mediante BFF→Kong→Logistics; validar identidad, asignación, coordenadas y timestamp. Otro empleado no puede publicar como ese repartidor ni modificar un envío fuera de su autorización.
- [x] Mostrar última ubicación, edad de señal, ruta y destino en el panel operativo. Señal antigua, permiso GPS denegado, ausencia de red o proveedor caído deben tener estados claros; una señal antigua no sobrescribe una nueva.
- [x] Gestionar reconexión sin generar acumulación ilimitada de posiciones. Hacer visible cuando la publicación se ha detenido o el navegador dejó de mantenerla activa.
- [x] Conservar Pendiente→Empacando→Enviado→Entregado y auditoría de actor/fecha. La entrega se confirma con acción autorizada; la proximidad del GPS no marca por sí sola un paquete como entregado.
- [x] Conservar privacidad: CUSTOMER consulta únicamente sus pedidos/envíos; la ubicación operativa del repartidor queda limitada a personas autorizadas.

**Criterio de cierre universitario:** la pantalla móvil publica posiciones DEMO identificadas como ficticias; el panel muestra mapa interactivo, marcador, destino ilustrativo y hora actualizados. GPS emulado, permiso denegado y desconexión se prueban sin bloquear preparación. La entrega se registra y aparece en la cuenta del cliente. Dos operaciones concurrentes no sobrescriben una transición por versión antigua. La evidencia distingue emulación, mapa y posición real.

**Entrega:** asignación por cuenta, pantalla móvil, APIs protegidas, mapa interactivo y pruebas del reparto universitario.

## Fase 7. Cerrar inventario, variantes y recorridos de venta

Trabajo:

- [ ] Preparar datos sintéticos reproducibles con varias sucursales y una prenda con tallas S/M/L, colores y materiales; cada variante tiene SKU y stock propios.
- [ ] Verificar crear/editar variantes, movimientos, punto de pedido, reservas y stock disponible desde UI. Alertar cuando disponible sea igual o menor al mínimo; mostrar AGOTADO a cero.
- [ ] Probar carrera física/física y física/online sobre la última unidad usando PostgreSQL real: exactamente una venta confirmada y sin cantidades negativas.
- [ ] Verificar Redis con búsqueda repetida, TTL, invalidación al editar catálogo y prueba de HIT que evita SQL. La caída de Redis permite degradar a PostgreSQL sin convertir la caché en fuente de inventario.
- [ ] Medir varias ventas→Dashboard: objetivo de p95 ≤3 s en el entorno local saludable; documentar muestra y condiciones. Durante desconexión, indicar retraso y recuperar snapshot automáticamente; no prometer ese tiempo bajo fallo de red.
- [ ] Verificar reconexión, eventos duplicados/invertidos y cambio rápido de sucursal; todos los estados se ordenan por revisión y no regresan.
- [ ] Completar recorridos de CUSTOMER y EMPLOYEE: búsqueda/filtros, variante, bolsa por usuario, cotización, checkout, pedidos propios, cancelación válida y seguimiento; mantener filtros y retorno de navegación.
- [ ] Probar cancelación frente a despacho, incluyendo proyección tardía de Logistics. No restituir stock/cupón de un pedido despachado por una carrera entre servicios.
- [ ] Recorrer la venta física con precio vigente y cliente opcional, conservando el contrato de modalidad; no generar preparación/envío por una venta PHYSICAL.

**Criterio de cierre:** venta física y compra online terminan desde la interfaz con importes, stock, Dashboard, CRM y Logistics consistentes. Los casos concurrentes y las compensaciones no duplican venta, descuento ni reposición. La demostración no requiere editar SQL ni invocar APIs manuales para las tareas ordinarias.

**Entrega:** fixtures, pruebas de carrera y recorridos de navegador por rol.

## Fase 8. Certificar el sistema completo y automatizar regresiones

Trabajo:

- [ ] Ejecutar lint, TypeScript, pruebas y build de web y los diez servicios; validar Compose y compatibilidad de migraciones.
- [ ] Integrar en CI los runners conjuntos de cuentas, negocio, navegador y auditor HTTP, además de los escenarios nuevos. Ejecutar secuencialmente los runners que alteran fixtures o reinician servicios.
- [ ] Ejecutar registro/verificación, invitación/desactivación, compra física/online, carrera, descuentos, cupones, rankings, preparación, GPS, entrega e historial en la misma versión candidata.
- [ ] Probar fallos controlados de PostgreSQL, Redis, RabbitMQ, Analytics, Notification, Pricing y Realtime exclusivamente en aislado; verificar recuperación, outbox/DLQ, reconciliación y deduplicación.
- [ ] Hacer una prueba de estabilidad con carga definida durante al menos 30 minutos y conservar tiempos, errores, salud y pendientes. No interpretar esta prueba como garantía universal de disponibilidad.
- [ ] Revisar desktop/móvil, teclado, foco, validaciones, contraste, etiquetas de gráficas y estados vacíos/degradados en las pantallas afectadas.
- [ ] Renovar reportes/capturas con fecha, versión y escenario; sanitizar contraseñas, tokens, enlaces de alta, datos privados y ubicaciones personales.

**Criterio de cierre:** batería completa aprobada, sin fallos funcionales/seguridad pendientes de los requisitos, recuperación comprobada y evidencia actual del SMTP local, mapa interactivo y reparto universitario. El pipeline debe impedir promover una versión que falle, conservando los reportes para diagnóstico.

**Entrega:** versión candidata certificada, CI y matriz de evidencia por requisito.

## Fase 9. Actualizar el principal y entregar

Trabajo:

- [ ] Tomar respaldo fresco en el punto consistente ensayado en fase 1, coordinando escrituras, tareas y mensajes; registrar estado del principal, checkpoints de colas y operaciones pendientes inmediatamente antes de actualizar.
- [ ] Aplicar las migraciones ensayadas y desplegar el conjunto de imágenes exacto de la fase 8, con configuración/secretos del destino y preservación de datos.
- [ ] Comprobar las operaciones reales del principal: login, roles, Inventario, catálogo, precios, Dashboard, pedidos, CRM y Logistics. No basta que los contenedores estén saludables.
- [ ] Repetir las comprobaciones no destructivas y un recorrido de validación con cuentas, artículos y destinatarios designados para pruebas; registrar y conciliar esos movimientos. Las carreras y caídas deliberadas permanecen en aislado.
- [ ] Comprobar Mailpit SMTP local, mapa OpenStreetMap y reparto DEMO contra la configuración universitaria del principal; conservar señal ficticia y límites de emulación explícitos.
- [ ] Validar conservación de datos, pendientes y coherencia de proyecciones tras el despliegue. Aplicar el procedimiento de recuperación si falla una condición de cierre.
- [ ] Actualizar guía de demostración, variables requeridas, arranque, respaldo, recuperación y matriz final. Conservar los reportes previos como historia sin atribuirles la certificación nueva.

**Criterio de cierre:** todos los requisitos de la matriz siguiente funcionan en la versión desplegada con el alcance universitario acordado. SMTP local, mapa y recorrido DEMO tienen pruebas explícitas; no se afirma GPS físico ni entrega de correo externo. La app permite los recorridos de cada rol desde UI, y hay evidencias técnicas actuales de arquitectura, concurrencia, caché y seguridad.

**Entrega:** app principal validada, guía de uso/demostración y acta de cierre con versión, fecha, pruebas y dependencias operativas configuradas.

## Cobertura de todos los requisitos originales

| Requisito | Fases de cierre | Evidencia obligatoria |
| --- | --- | --- |
| API Gateway único | 2, 8, 9 | Ruta navegador/BFF→Kong→servicio; sin negocio local en Next |
| REST JSON y colas | 2, 5, 8 | JSON, RabbitMQ, outbox y procesamiento/reintento de correo |
| BD independientes | 1, 2, 8 | Propietarios, credenciales y cruces por API/eventos |
| Contenedores independientes | 2, 8 | Parada/restauración de un dominio y continuidad del resto |
| CORS y JWT | 1, 2, 8, 9 | Origen permitido/indebido, preflight, roles, expiración y revocación |
| Atomicidad de inventario | 7, 8 | Dos compras de última unidad; una confirmación; stock no negativo |
| Redis de productos | 3, 7, 8 | HIT sin SQL, TTL, invalidación y recuperación |
| Precios dinámicos a medianoche | 3, 8 | Fronteras de tiempo, UI cotizada y pedido definitivo |
| Chart.js barras y pastel | 4, 8 | Bar y Pie literal con stock consistente por sucursal |
| Sincronización de inventario | 7, 8, 9 | Venta→AGOTADO, medición de latencia y reconexión |
| Alertas de reabastecimiento | 7, 8 | Punto de pedido y lista roja correcta |
| Talla/color/material | 7, 8 | Variantes con SKU/stock independientes |
| Ventas por sucursal hoy | 4, 7, 8 | Dos sucursales, día CDMX y proyección coherente |
| Top productos/categorías | 4, 8 | Agrupación de variantes y comparación por categoría |
| Ticket promedio | 4, 8 | Total / tickets, cancelaciones y periodos consistentes |
| Pick & Pack | 6–8 | Tres columnas, transición, versión y auditoría |
| Rutas y estado de entrega | 6, 8, 9 | Mapa interactivo, DEMO identificada, GPS emulado y entrega autorizada |
| CRM historial | 5, 7, 8 | Artículos, fechas, precios históricos y cancelaciones |
| CRM cupón a inactivos | 3, 5, 8, 9 | Segmento, reevaluación, SMTP, canje e idempotencia |

## Dependencias que deben resolverse antes del cierre

| Dependencia | Necesaria para | Resultado requerido |
| --- | --- | --- |
| Mailpit y remitente sintético local | 5 y 9 | Aceptación SMTP y mensaje capturado, sin buzón externo |
| OpenStreetMap y conexión para teselas | 6 y 9 | Mapa con atribución, marcador y destino ilustrativo identificado |
| Navegador local y modo DEMO | 6 y 9 | Pantalla móvil autenticada, inicio/parada, GPS emulado y entrega autorizada |
| Acceso al entorno principal y espacio privado de respaldos | 1 y 9 | Actualización/restauración sin pérdida de datos |

Estas dependencias locales se configuran y comprueban durante el plan. La simulación GPS se acepta específicamente para este proyecto universitario y se identifica en UI e informes. No sustituye una futura certificación de reparto físico.

## Definición final de listo

- [ ] Fases 1–9 cerradas con evidencia, no solo código.
- [ ] Todos los requisitos de la matriz aprobados en la versión final.
- [ ] Auditor HTTP del principal sin fallos; APIs y navegador con roles correctos.
- [ ] Lint, tipos, build, pruebas de aceptación y CI aprobados para la misma versión.
- [ ] SMTP local, mapa interactivo y señal DEMO comprobados con configuraciones universitarias finales.
- [ ] Datos previos preservados; migraciones, respaldo y recuperación ensayados.
- [ ] Funciones comunes operables desde la app; errores y retrasos explicados en UI.
- [ ] Guía y reportes actuales, sin secretos ni dependencias pendientes ocultas.

Cada implementación actualizará el estado de su fase, archivos afectados, migraciones, pruebas, evidencia y cualquier impedimento concreto. Este documento no marca como ejecutado el trabajo futuro.
