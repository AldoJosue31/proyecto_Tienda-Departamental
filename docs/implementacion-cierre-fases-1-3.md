# Implementación de las fases de cierre 1, 2 y 3

Fecha: 13 de octubre de 2026. Estado: **fases 1, 2 y 3 implementadas y validadas en la candidata**.

Versión: `fases-1-3-20261013-86397846056e`. El [resumen de verificación](verification-fases-1-3-summary.json) reúne 351 pruebas de los once proyectos, 88 comprobaciones de integración/auditoría y cinco pruebas de navegador. Los 24 contenedores candidatos están saludables; los 25 contenedores originales del principal también están saludables y conservaron sus imágenes.

Este informe corresponde a las primeras tres fases del [plan de cierre integral](plan-cierre-definitivo.md). La candidata funciona en [localhost:3105](http://localhost:3105), con Gateway en [localhost:8005](http://localhost:8005) y captura SMTP en [localhost:18025](http://localhost:18025). El despliegue definitivo del principal, en el puerto 3005, pertenece a la fase 9. Las fases 4 a 9 siguen pendientes.

## Fase 1: versión compatible y recuperación

Los diez servicios, Kong y la web se verificaron juntos en el entorno aislado. ADMIN puede consultar Inventario; CUSTOMER recibe 403 y una petición sin JWT recibe 401. Los contratos de identidad incluyen versión de usuario, revocación y renovación de sesión.

El [manifiesto](release-fases-1-3.json) registra Git HEAD, archivos modificados y sus hashes, eliminaciones, 26 migraciones, imágenes exactas y etiquetas locales inmutables. Incluye cambios sin commit; no equivale a un commit publicado. `compose.release.yaml` fija las imágenes del conjunto, sin incorporar Mailpit al entorno principal.

Se respaldaron y restauraron diez bases por entorno: nueve de dominio y la heredada de Next. Los escritores, schedulers y consumidores se pausaron juntos; RabbitMQ se detuvo después de comprobar que no había mensajes sin confirmar. Se conservan su almacenamiento durable y hostname original, además de la configuración privada. La restauración usa clones sin red y comprueba IDs, columnas originales, registros y ledger de migraciones. Se ejecutaron las migraciones dos veces.

El ensayo con trabajo pendiente conserva un borrador sintético de venta, su evento, una reserva, un correo y tres mensajes durables. El clon no consume los mensajes ni envía correos. El borrador sirve para verificar preservación; no simula una compra completa reanudada desde el navegador. La ausencia de doble consumo de stock y la repetición del snapshot de una compra real se acreditan en las pruebas de Orders y de compra. SMTP puede aceptar un mensaje antes de que el emisor registre la aceptación: restaurar o reiniciar no garantiza entrega exactamente una vez.

Evidencia: [respaldo principal, 13 comprobaciones](fases-1-3-verification-release-web.json), [respaldo aislado, 15 comprobaciones](verification-release-fases-1-3-departamental-five-phases.json), [18 ensayos con las imágenes reales de los servicios](verification-release-fases-1-3-images.json) y [archivos de imágenes recargados y verificados](fases-1-3-verification-release-archive.json). Los respaldos privados están fuera de Git; los reportes no exportan contraseñas ni contenido de usuarios.

## Fase 2: seguridad, aislamiento y recuperación ante fallos

Kong y los servicios rechazan orígenes no permitidos con 403. Se probaron GET, POST, OPTIONS y Socket.IO; el preflight válido de una ruta autenticada no exige JWT. La web también verifica Origin, contexto del navegador y JSON en mutaciones autenticadas mediante cookies. Las respuestas preservan un identificador de correlación y distinguen autenticación, autorización, validación y conflictos.

Cada PostgreSQL está conectado a su red de datos y a su servicio propietario. El Gateway no accede a esas redes. El entorno de pruebas agrega un puente por dominio para sus sondas locales; no comparte un puente entre bases ajenas. La web usa BFF → Kong → servicios. Se retiraron el scheduler de Next, su endpoint y los módulos de negocio que accedían al PostgreSQL/Redis heredados. Esos volúmenes y su respaldo se conservan bajo el perfil `legacy`; los datos de negocio de sus tablas de ventas y reservas estaban vacíos, y los datos iniciales se preservan.

Los pools PostgreSQL manejan errores de conexiones inactivas. Los publicadores outbox reanudan su ciclo después de fallos temporales. Precios devuelve 503 al perder PostgreSQL y recupera conexiones sin terminar su proceso. Compose reinicia procesos caídos; una dependencia temporalmente indisponible no requiere reiniciar toda la aplicación. Kong refresca DNS para resolver un servicio recreado.

Los consumidores de Analytics, CRM, Logistics y Notification reintentan eventos válidos con confirmación del broker antes de retirar el original. Conservan IDs para deduplicar, limitan intentos y separan mensajes inválidos en DLQ. Se investigaron los mensajes válidos pendientes de Analytics y se recuperaron en el entorno aislado; los del principal se conservan hasta instalar el conjunto compatible. El helper rechaza su reejecución en el principal mientras sus imágenes sean incompatibles.

Las pruebas detienen PostgreSQL y RabbitMQ, provocan una caída real del proceso de Precios y detienen Analytics/Notification. Verifican recuperación, venta disponible, outbox pendiente, proyección única y supervivencia del proceso cuando corresponde. Estos fallos se inyectan únicamente en contenedores identificados del proyecto de pruebas.

Evidencia: [cierre de las primeras tres fases](fases-1-3-verification-close-first-three.json), [cuentas y seguridad](fases-1-3-verification-accounts-first-five.json), [carreras de identidad](fases-1-3-verification-accounts-races.json), [auditor HTTP](fases-1-3-audit-runtime-integration-2026-10-13.json) y [DLQ aislada](verification-dlq-departamental-five-phases.json).

## Fase 3: precio vigente visible y compra consistente

Pricing resuelve precios base a través de Catalog y cotiza lotes acotados. Rechaza precios base inventados por el navegador. El BFF compone catálogo, detalle y carrito con el precio de lista, vigente, ahorro y promoción. Checkout y venta física usan el mismo cálculo y envían el total mostrado al confirmar.

Las cotizaciones vencen como máximo a los 30 segundos o en el siguiente inicio/fin de promoción. La interfaz invalida el precio vencido incluso sin conexión, muestra que debe actualizarlo y bloquea la confirmación hasta tener una cotización válida. Recuperar foco o conexión actualiza la cotización. Redis conserva información de catálogo, sin almacenar beneficios personalizados. Los caches privados y las cotizaciones se separan por identidad.

Si el precio cambia, Orders devuelve 409 `PRICE_CHANGED` antes de reservar inventario; la interfaz informa el cambio y requiere otra confirmación. Una compra ya confirmada conserva su snapshot al repetir la misma clave, aunque luego cambie la promoción. Si se pierde la respuesta, la interfaz conserva artículos, total y clave, bloquea edición y permite reintentar la misma intención de compra.

Se conserva el mejor beneficio de las reglas existentes, sin sumar cupón y promoción, así como la restitución del derecho de cupón al fallar/cancelar cuando corresponde. Las pruebas temporales verifican 23:59:59.999, inicio inclusivo a las 00:00 y fin exclusivo en America/Mexico_City. La cotización es correcta aunque el scheduler aún no cambie el estado de la promoción.

Evidencia: [calidad de los once proyectos, 351 pruebas](fases-1-3-verification-release-quality.json), [integración de ventas e inventario](fases-1-3-verification-five-phases.json), [cupones, cancelación y entrega](fases-1-3-verification-final-phases.json) y [cinco pruebas de navegador](fases-1-3-verification-accounts-browser.json). El flujo de navegador cambia la promoción antes de confirmar y pierde una respuesta después de crear el pedido; comprueba el nuevo total y un solo pedido al reintentar. Se revisaron visualmente las capturas de [escritorio](screenshots/checkout-precio-vigente-desktop.png) y [móvil](screenshots/checkout-precio-vigente-mobile.png) de la imagen final.

## Cómo demostrarlo en la web

1. Abre la candidata e inicia sesión con las cuentas de prueba indicadas en la [guía](guia-demostracion-requisitos.md). Usa una ventana ADMIN y otra CUSTOMER. Las contraseñas están en `.env.integration`.
2. Como ADMIN, abre Inventario. Como CUSTOMER, verifica que administración no está disponible. En Network, las peticiones del navegador van a `/api/...`; el BFF las deriva al único Gateway.
3. En Promociones, crea un descuento para una variante disponible con inicio anterior al momento actual y fin próximo. Abre su catálogo y detalle como CUSTOMER: comprueba lista tachada, precio vigente, ahorro y promoción. Añade la variante a la bolsa y verifica líneas y total.
4. Cambia la cantidad o valida un cupón propio. Comprueba el nuevo total. Al vencer la promoción, el precio se actualiza; si la cotización falla, aparece pendiente y la compra queda deshabilitada.
5. Abre Venta física como ADMIN/EMPLOYEE y elige la misma variante: su cotización aplica las mismas reglas. Usa datos sintéticos únicamente.
6. Para acreditar concurrencia, medianoche, pérdida de respuesta y fallos de infraestructura, usa los reportes y los scripts siguientes. No se pueden demostrar todas esas garantías mirando una pantalla estática.

```powershell
node scripts/verify-close-first-three.mjs
node scripts/verify-accounts-first-five.mjs
node scripts/verify-five-phases.mjs
node scripts/verify-final-phases.mjs
npm run test:accounts-browser
node scripts/verify-accounts-races.mjs
node scripts/audit-requirements.mjs
node scripts/audit-projection-dlq.mjs
```

Ejecuta los runners en serie: comparten fixtures y algunos detienen servicios. El pipeline de CI está preparado con esa secuencia; no se ha ejecutado remotamente en esta entrega.

El build de web reportó cero vulnerabilidades en sus dependencias de producción y cinco de severidad alta en dependencias de desarrollo heredadas. Las pruebas de JWT/CORS/CSRF no sustituyen la revisión completa de dependencias; esos avisos de desarrollo siguen pendientes para la certificación integral.

Consulta el [procedimiento de recuperación](recuperacion-cierre-fases-1-3.md) antes de cambiar imágenes o restaurar datos. El principal conserva su versión anterior hasta la fase 9. El pastel real de Chart.js y ranking por categorías, SMTP externo/segmento ampliado y reparto operativo siguen en las fases siguientes; esta entrega no los declara terminados.
