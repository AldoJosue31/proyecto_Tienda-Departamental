# Fases 4, 5 y 6: reportes, CRM y reparto universitario

Entrega local del 13 de octubre de 2026. La candidata está disponible en **http://localhost:3105**, con Gateway 8005 y correo de prueba en **http://localhost:18025**. El principal 3005/8000 conserva su versión anterior; su actualización corresponde a la fase 9.

Estado: **fases 4, 5 y 6 cerradas**. Versión `fases-4-6-20261013-7a03fdfd18c3`: 358 pruebas de código, 101 comprobaciones de integración/auditoría, nueve recorridos de navegador y una comprobación adicional de mapa con teselas reales. La certificación integral de las fases 7–9 aún no se ha realizado.

El usuario aclaró que este es un proyecto universitario y no cuenta con proveedor SMTP, dominio HTTPS ni teléfono de validación. Por ello, el criterio aceptado es SMTP real hacia Mailpit local, mapa interactivo OpenStreetMap y posiciones ficticias identificadas como demostración. El GPS del navegador está implementado y se comprueba con emulación y permisos; no se atribuye una prueba en teléfono físico. Las fases 7–9 siguen pendientes.

## Qué quedó implementado

**Fase 4.** El Dashboard utiliza `Pie` de Chart.js sin hueco y conserva barras de inventario y ventas por sucursal. Incluye Top productos y Top categorías, comparación por unidades o importe, Hoy/7 días/30 días en America/Mexico_City, ticket promedio con numerador y cantidad de tickets, y tablas accesibles debajo de las gráficas. Las variantes se suman por producto y las cancelaciones se descuentan una sola vez.

Analytics conserva la identidad de categoría de cada línea. Un reconciliador recupera categorías históricas mediante la API privada de Orders; los nombres se resuelven por lotes en Catalog y se presentan como nombres actuales. La información irrecuperable aparece como «Sin categoría histórica», con contador explícito. No se inventa el nombre que tenía una categoría cuando se realizó la compra.

**Fase 5.** CRM muestra nombres, fecha de alta y compras oficiales con artículos, SKU/variante, precio cobrado, ahorro, cupón y fecha, conservando también el precio de lista en el snapshot consultable por API. Obtiene identidades mínimas de Auth y compras de Orders por APIs privadas, con credenciales distintas por consumidor; no consulta bases ajenas. El perfil limita el detalle a las 100 compras más recientes y avisa si hay más; los totales y fechas de actividad se calculan sobre todas las compras confirmadas.

El segmento separa compradores cuya última compra es anterior al corte de tres meses calendario y personas sin compras cuya alta tiene al menos esa antigüedad. Las altas recientes se excluyen. Al confirmar la campaña, Orders proporciona una lectura oficial única y un instante de referencia que CRM conserva con el corte; una compra ya confirmada antes de esa lectura excluye al cliente aunque su evento esté retrasado. El publicador revalida antes de emitir el cupón y puede retirar un destinatario que compre después del instante de referencia. No se promete atomicidad distribuida entre bases.

La cobertura admitida es de hasta 1000 clientes habilitados: si se excede, o Auth/Orders no permiten acreditar el conjunto completo, se rechaza la campaña con un error recuperable, sin enviar un segmento parcial. La campaña y su reintento conservan el mismo conjunto y derechos de cupón. RabbitMQ, Pricing y Notification llevan el cupón hasta un mensaje aceptado y visible en Mailpit; el canje en checkout conserva el descuento en el historial.

**Fase 6.** Operación asigna personas EMPLOYEE habilitadas mediante un selector con nombres. «Mi reparto» muestra los envíos activos de la cuenta y permite iniciar/detener publicación y confirmar la entrega. La API deriva la identidad del JWT, verifica asignación y versión, e impide publicar como otro repartidor, apropiarse de su envío o confirmar su entrega. Despachar requiere repartidor y dirección.

La pantalla ofrece Demostración universitaria y GPS del navegador. Mantiene una solicitud activa y una posición reciente, descarta posiciones antiguas, pausa sin red, obtiene una señal nueva al reconectar y se detiene al ocultar la pantalla. Explica permisos denegados, ausencia de contexto seguro y servicio inaccesible. Cada posición conserva su origen `DEMO`, `DEVICE` o `MANUAL`; el panel muestra hora y edad de la señal. Un timestamp antiguo no sustituye una posición reciente.

El mapa OpenStreetMap presenta marcador, destino y atribución. En modo demo, el destino ficticio es el Zócalo y la línea es un segmento ilustrativo, identificado expresamente. La ruta por calles de Google se conserva como opción cuando se configure ese proveedor; no es necesaria para esta entrega universitaria. La entrega exige una acción autorizada y registra actor/fecha; el cliente ve Entregado, con la ubicación operativa restringida a personal autorizado.

## Cómo demostrarlo desde la app

Las contraseñas de las cuentas locales están en el archivo privado `.env.integration`; no se incluyen en este informe.

1. Entra como `admin@departamental.local` a **Administración**. Baja a los reportes: muestra las barras y el pastel sin hueco. Cambia Hoy/7 días/30 días y Unidades/Importe vendido. Abre «Ver datos de Top categorías» y compara con Top productos y la fórmula del ticket promedio.
2. En **CRM**, muestra «Compradores inactivos» y «Sin compras · alta antigua». Abre un cliente para consultar artículos y ahorro histórico. Crea una campaña desde su vista previa; abre Mailpit en 18025 y consulta el mensaje/código. Una cuenta destinataria puede canjearlo en su bolsa y ver el total descontado antes de confirmar.
3. Para un pedido online, entra a **Operación**, abre su tarjeta, pasa de Pendiente a Empacando y abre «Editar asignación de reparto». Elige el empleado local y guarda la dirección. Pasa a Enviado.
4. En otro navegador o una ventana privada, entra como `employee@departamental.local` a **Mi reparto**. Elige el envío y «Demostración universitaria», pulsa Iniciar publicación y conserva la pestaña visible. En unos segundos, el panel de Operación mostrará la señal ficticia y el mapa. Detener interrumpe las publicaciones; el marcador conserva la última lectura y su edad.
5. Desde Mi reparto, confirma «Paquete entregado». La tarjeta operativa y la cuenta del cliente reflejan Entregado. No existe entrega automática por proximidad al destino.

Las pruebas dejan un envío ficticio activo para la demostración y cuentas/clientes con nombres «Cliente universitario…». Los identificadores de ese fixture están en `.env.phases-four-six-fixture`, excluido de Git. Los runners alteran únicamente `departamental-five-phases`; no deben ejecutarse simultáneamente ni apuntarse al principal.

## Evidencia y repetición

- [Integración de fases 4–6](verification-close-four-six.json): 13 comprobaciones con PostgreSQL, Redis, RabbitMQ, Kong, BFF y SMTP local. Incluye compras entre vista previa y confirmación con RabbitMQ detenido, cancelación repetida, canje real y entrega concurrente.
- [Interfaz de fases 4–6](verification-phases-four-six-browser.json): Dashboard, CRM, selector/mapa y reparto móvil con inicio/parada, permiso denegado y recuperación de red. Las pruebas automáticas sustituyen las teselas del mapa por imágenes locales; no atribuyen esa prueba a disponibilidad de OSM ni a GPS físico.
- [Mapa con teselas reales](verification-university-map-live.json): comprobación adicional de carga, zoom, atribución y posición ficticia desde el navegador local. No se usa como dependencia de CI ni garantiza disponibilidad futura del proveedor.
- [Calidad de los once proyectos](verification-release-quality.json), [resumen de cierre](verification-fases-4-6-summary.json), [manifiesto de imágenes](release-fases-4-6.json) y [migraciones con esas imágenes](verification-release-images-fases-4-6.json).
- [Regresiones de cuentas](verification-accounts-first-five.json), [ventas y campañas](verification-five-phases.json), [flujos integrados](verification-final-phases.json), [navegador de cuentas](verification-accounts-browser.json), [carreras](verification-accounts-races.json) y [auditoría de requisitos](audit-runtime-integration-2026-10-13.json).

Con el entorno aislado sano y los módulos de servicios compilados:

```powershell
node scripts/verify-close-four-six.mjs
npm run test:phases-four-six-browser
```

El primer comando regenera fixtures y verifica los servicios; el segundo usa ese fixture y genera capturas de escritorio/móvil. CI contiene ambos comandos en secuencia después de las regresiones previas; se verificó localmente y no se afirma una ejecución remota de CI.

Capturas actuales: [pastel Chart.js](screenshots/phase4-pie-chart.png), [Dashboard](screenshots/accounts-phase4-dashboard-desktop.png), [CRM móvil](screenshots/accounts-phase5-crm-mobile.png), [mapa real con posición ficticia](screenshots/accounts-phase6-map-live-desktop.png) y [Mi reparto móvil](screenshots/accounts-phase6-delivery-mobile.png). Las capturas completas permiten ampliar los datos; el reporte de navegador también comprueba ausencia de desbordamiento horizontal a 390 px.

## Recuperación y límites del alcance

Antes de aplicar las tres migraciones nuevas se preservaron diez bases y RabbitMQ del candidato, con restauración ensayada. El checkpoint principal anterior y sus imágenes permanecen disponibles. [El archivo de imágenes de fases 4–6](verification-release-archive-fases-4-6.json) conserva las imágenes exactas de la candidata y del principal; el procedimiento coordinado de [recuperación](recuperacion-cierre-fases-1-3.md) sigue aplicando, usando el nuevo manifiesto para esta entrega. No se revierte esquema o broker por separado.

`compose.release-fases-4-6.yaml` fija las imágenes locales para la actualización posterior. `compose.university.yaml` agrega SMTP local al principal durante la fase 9; no se aplicó al principal ahora. El entorno aislado ya utiliza `compose.integration.yaml` y Mailpit 18025.

Mailpit acredita aceptación SMTP y contenido capturado, sin envío a un buzón externo, lectura del correo ni entrega exactamente una vez. Las posiciones demo no corresponden a personas reales. El mapa necesita conexión para sus teselas; si fallan, muestra un aviso y conserva coordenadas y las acciones de preparación/entrega. Se respeta la atribución y la carga ordinaria de teselas, sin archivo offline ni precarga masiva, conforme a la [política oficial de OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/). El GPS requiere permiso y contexto seguro; localhost es válido para la prueba local según la [documentación de geolocalización](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition) y [contextos seguros](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts).
