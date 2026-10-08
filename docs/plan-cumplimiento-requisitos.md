# Plan de corrección y cumplimiento de la tienda departamental

Fecha de preparación: 8 de octubre de 2026.

Este plan convierte la revisión de los dos documentos proporcionados en tareas de implementación y pruebas de aceptación. El objetivo es completar los requisitos de Tienda Departamental y corregir los defectos encontrados conservando la arquitectura de microservicios, sus bases independientes y el acceso del frontend mediante Kong. Las fases 1 a 8 están implementadas. La evidencia y los límites de las verificaciones están registrados en [implementación de las fases 1 a 5](implementacion-fases-1-5.md) y [fases 6 a 8](implementacion-fases-6-8.md).

## Base de la revisión

- Proyectos App Web.docx, sección B Tienda Departamental.
- Requerimientos Técnicos Generales.docx, requisitos generales y específicos de Tienda Departamental. CORS y JWT son opcionales en el documento y ya existen.
- Resultado inicial: 153 pruebas aprobadas, TypeScript aprobado en la web y los diez servicios, ESLint de la web aprobado, configuración Compose válida y 25 contenedores existentes saludables.
- Diferencia comprobada en el entorno revisado: Inventory contiene 114 unidades en 14 registros; Analytics proyecta 8 unidades en un registro. Estas cantidades son una referencia de diagnóstico, no valores que deban fijarse en las pruebas.
- Notification está en modo log, sin SMTP configurado. Las claves de Maps y Routes están presentes, pero su operación externa no fue acreditada.

## Orden de ejecución

| Fase | Prioridad | Entrega | Dependencia |
| --- | --- | --- | --- |
| 1 | Alta | Datos y eventos de inventario con orden confiable y pruebas aisladas | Base para fases 2 y 3 |
| 2 | Alta | Proyección completa de stock, gráficas exigidas y ranking correcto | Fase 1 |
| 3 | Alta | Recuperación del dashboard y configuración correcta de sockets | Fase 1 |
| 4 | Alta | Promociones con fechas y zona horaria correctas | Puede avanzar junto con fases 1 a 3 |
| 5 | Alta | Segmentación CRM correcta y consistente | Puede avanzar junto con fase 4 |
| 6 | Alta | Correos verificables y estados de simulación claros | Fase 5 para el flujo completo de campañas |
| 7 | Media | Cupón de descuento utilizable y checkout idempotente | Fases 4, 5 y 6; ampliación propuesta |
| 8 | Cierre | Mapas y flujos completos comprobados en navegador y contenedores | Fases anteriores |

## Fase 1 Consistencia del inventario

Componentes: Inventory, su outbox, contratos de eventos, Analytics y Realtime.

- [x] Añadir una revisión numérica por registro de stock y aumentarla en la misma transacción que modifica existencias o reservas.
- [x] Incluir la revisión en las respuestas HTTP y eventos. Usar la revisión para ordenar estados; conservar los timestamps para fechas y medición de latencia.
- [x] Preparar migraciones compatibles con los registros existentes y una transición explícita para mensajes antiguos. Un evento antiguo sin revisión no debe sobrescribir un estado nuevo versionado.
- [x] Hacer que los consumidores ignoren duplicados y estados con revisiones anteriores. Actualizar contratos y pruebas de todos los consumidores afectados.
- [x] Añadir un proceso de Inventory para liberar reservas vencidas por lotes y publicar sus cambios. El scheduler heredado de Next.js no mantiene las reservas de este servicio.
- [x] Preparar PostgreSQL y RabbitMQ de pruebas en un proyecto Compose independiente, con datos, puertos y volúmenes propios.

Aceptación: dos compras simultáneas sobre una última unidad producen una sola compra confirmada, la otra recibe falta de stock y las cantidades nunca son negativas. Duplicar o invertir eventos no revierte el estado. Una reserva vencida se libera automáticamente sin depender de otra compra. Las migraciones se prueban con datos previos.

## Fase 2 Analytics y gráficas

Componentes: Analytics, API privada de Inventory, contratos del dashboard y analytics-dashboard.tsx.

- [x] Añadir un snapshot paginado de existencias y sucursales, protegido para comunicación interna. Analytics debe obtenerlo por API o eventos, sin consultar PostgreSQL de Inventory.
- [x] Activar el consumo durable de cambios antes de importar el snapshot y aplicar cada registro según su revisión. Una venta concurrente con la importación debe prevalecer sobre un snapshot anterior.
- [x] Implementar importación inicial y reconciliación reintentable para corregir también las instalaciones existentes. Registrar avance y cobertura.
- [x] Incluir las sucursales sin ventas y con stock cero. Mantener nombres de sucursal legibles.
- [x] Agregar barras de stock por sucursal junto con la gráfica circular existente usando Chart.js.
- [x] Corregir Top productos agrupando por identidad de producto y sumando todas sus variantes. Elegir un nombre de presentación consistente para snapshots históricos.
- [x] Refrescar los reportes después de cambios y mostrar si la importación inicial está pendiente.

Aceptación: todas las existencias oficiales aparecen en Analytics tras la reconciliación y sus totales coinciden por sucursal. Un producto con dos variantes que venden 6 y 6 unidades aparece una sola vez con 12, por encima de otro que vende 9. El dashboard incluye barras y distribución circular de stock, ventas por sucursal y ticket promedio.

## Fase 3 Sincronización del dashboard

Componentes: inventory-dashboard.tsx, realtime.ts, shipment-tracking-panel.tsx y configuración del Gateway.

- [x] Obtener un snapshot nuevo al conectar o reconectar Socket.IO.
- [x] Activar consultas periódicas de respaldo mientras la conexión esté caída y detenerlas al recuperar el socket.
- [x] Fusionar snapshots y eventos por revisión, evitando que una respuesta HTTP atrasada reemplace un cambio reciente.
- [x] Cancelar o descartar respuestas de una sucursal que dejó de estar seleccionada.
- [x] Entregar desde el servidor la URL pública del Gateway a los componentes de sockets. Evitar que una imagen compilada quede fijada a localhost:8000.
- [x] Comprobar cookies, autenticación y CORS con el origen y puerto reales de la web.

Aceptación: una venta hecha durante la desconexión aparece al reconectar sin intervención manual. Cambiar rápidamente de sucursal no mezcla datos. Una venta física de la última unidad muestra AGOTADO automáticamente; objetivo propuesto de hasta 3 segundos en el entorno local de pruebas con servicios saludables. Una URL de Gateway distinta de localhost:8000 funciona con la misma imagen web.

## Fase 4 Precios y promociones programadas

Componentes: Pricing, sus DTO y tests, Orders y gestión administrativa de promociones.

- [x] Exigir que las fechas de la API tengan UTC o desfase explícito; rechazar fechas ambiguas sin zona.
- [x] Convertir la fecha y hora seleccionadas en la zona de la campaña a un instante UTC antes de enviar la petición. La zona de la campaña debe prevalecer sobre la del navegador.
- [x] Mantener el cálculo efectivo del precio en Pricing y el snapshot definitivo en Orders.
- [x] Completar un formulario administrativo para crear, consultar y editar promociones con descuento, alcance, vigencia y zona horaria. Esta interfaz completa la operación desde el dashboard; el servicio ya tiene APIs.
- [x] Añadir pruebas del inicio, fin y reinicio del scheduler, incluyendo cambios de horario en las zonas que los tengan.

Aceptación: Venta Nocturna inicia a las 00:00 de America/Mexico_City, deja de aplicarse al vencer y funciona aunque la reconciliación del estado aún no haya ejecutado su siguiente intervalo. Un cliente situado en otra zona no desplaza la campaña. Orders confirma el precio calculado por Pricing.

## Fase 5 Segmentación CRM

Componentes: crm.service.ts, BFF de campañas y crm-workspace.tsx.

- [x] Aplicar mínimo de tres meses también en el backend y conservar las opciones de tres, seis y doce meses.
- [x] Calcular meses calendario ajustando días inexistentes al último día válido del mes y usando una zona de negocio definida.
- [x] Usar la misma regla de corte para vista previa y creación de campaña.
- [x] Recalcular destinatarios al confirmar y comprobar la elegibilidad antes de emitir el derecho de descuento. Documentar el instante de referencia de la campaña.
- [x] Conservar explícitamente la exclusión actual de identidades sin compras previas; los documentos no definen ese segmento.

Aceptación: se rechazan campañas de uno o dos meses. Se comprueban finales de mes, febrero y años bisiestos. Si un cliente compra después de la vista previa y antes de confirmar, queda excluido de la campaña. Una reentrega no duplica destinatarios.

## Fase 6 Notification y entrega de correos

Componentes: Notification, eventos de resultado, proyección de campañas CRM, UI y Compose.

- [x] Diferenciar simulación, aceptación por SMTP y fallo. El modo log no debe producir una confirmación de correo enviado.
- [x] Mostrar el estado simulado y su contador en CRM cuando se use desarrollo local.
- [x] Dar salida externa al contenedor Notification para SMTP, conservando PostgreSQL y RabbitMQ en redes privadas.
- [x] Validar modo SMTP, remitente y configuración del proveedor. Revisar vigencia del cupón antes de enviar.
- [x] Conservar outbox, deduplicación y reintentos limitados. Una campaña debe poder recuperarse después de reiniciar servicios.
- [x] Añadir un servidor SMTP de captura al entorno de pruebas para verificar mensajes sin contactar clientes reales.

Aceptación: modo log aparece como simulado; modo SMTP produce un mensaje capturado con destinatario, código y vigencia correctos. Un fallo temporal se reintenta y uno persistente aparece como fallo. La aceptación del servidor SMTP se distingue de la recepción final por el cliente.

Dependencia externa: el envío real requiere un proveedor SMTP, remitente y credenciales válidas. El código y la integración local pueden completarse antes de disponer de ellos.

## Fase 7 Canje de cupones

Esta fase es una ampliación propuesta para que el cupón de descuento tenga utilidad en la compra. Los documentos exigen enviarlo, pero no especifican su canje ni sus reglas.

Componentes: Pricing como propietario del descuento y derechos de uso, CRM como propietario de elegibilidad y campaña, Orders como propietario del pedido, Notification y checkout.

- [x] Permitir definir descuento porcentual o fijo, importe, alcance y vigencia, sin presuponer un porcentaje obligatorio.
- [x] Emitir derechos de uso para los clientes elegibles y enviar el correo solo después de confirmar su creación en Pricing.
- [x] Añadir entrada de código y validación en checkout, con mensajes claros para cupón vencido, ajeno, inválido o utilizado.
- [x] Reservar el uso atómicamente por cliente y pedido. Repetir un checkout con la misma clave debe conservar pedido, descuento y reserva.
- [x] Guardar el descuento definitivo en el snapshot del pedido y confirmar su uso mediante operaciones o eventos idempotentes.
- [x] Liberar la reserva si la compra falla y reconciliar operaciones interrumpidas mediante APIs, sin leer bases ajenas.
- [x] Documentar las reglas propuestas: un uso por cliente, sin acumulación con promociones y aplicación del mejor beneficio; una cancelación aceptada antes del despacho restituye el uso conservando la vigencia original.

Aceptación: el código recibido reduce el total del cliente autorizado. Dos pedidos concurrentes no consumen dos veces el mismo derecho. Los reintentos no duplican descuento ni pedido. Un fallo de compra libera inventario y cupón; la recuperación funciona después de reiniciar servicios.

## Fase 8 Mapas y validación completa

- [x] Verificar Google Maps y Routes con las claves existentes, origen autorizado, ubicación válida y dirección de destino.
- [x] Comprobar posición del repartidor, ruta, señal antigua y estado de entrega. Identificar claramente el destino cuando la ruta esté disponible.
- [x] Probar errores de proveedor y configuración ausente, conservando la operación de Pick & Pack.
- [x] Ejecutar los flujos completos desde navegador: login, compra online, venta física, agotado, gráficas, promoción, preparación, envío, entrega, historial CRM y campaña.
- [x] Comprobar autorización por rol, idempotencia y recuperación de fallos en los servicios afectados.
- [x] Ejecutar TypeScript, lint, pruebas y build de la web y servicios afectados; validar Compose y contratos reales mediante Kong.
- [x] Actualizar la documentación con requisitos cumplidos, evidencia de pruebas y dependencias externas pendientes.

Aceptación final: cada requisito de los documentos tiene una prueba reproducible y un resultado registrado. La concurrencia, sockets, proyecciones y correo se acreditan con componentes reales en el entorno de pruebas; la operación de Maps y del proveedor SMTP externo se registra por separado.

## Forma de entrega

Cada fase se entrega con cambios revisables, migraciones necesarias, pruebas de aceptación y un resumen de lo comprobado. Los cambios de contratos se coordinan entre productores, consumidores y frontend. La arquitectura mantiene sus propietarios de datos y el Gateway. Las pruebas de compras, campañas y fallos utilizan exclusivamente el entorno aislado; los datos actuales no se usan como fixtures ni se reinician.
