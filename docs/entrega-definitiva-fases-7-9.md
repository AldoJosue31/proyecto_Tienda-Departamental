# Entrega de las fases 7–9

**Cierre aprobado el 14 de octubre de 2026.** Fases 7, 8 y 9 completadas; principal validado en http://localhost:3005. Versión fases-7-9-20261013-be87fd10ff60, código de aplicación 2ea6dbe1379e34e7cbc59a1bc2ea67c5a1c15415.

[GitHub Actions aprobado](https://github.com/AldoJosue31/proyecto_Tienda-Departamental/actions/runs/38525332057): doce jobs, batería secuencial de catorce comandos y 30 minutos de estabilidad. Calidad local: 364 pruebas. Estabilidad local: 1.074 lecturas, cero errores, sin reinicios y outbox pendientes en cero; CI: 1.080 lecturas y cero errores. Venta→Dashboard: 12 muestras, p95 1.222 ms, reconexión y AGOTADO comprobados. Siete recorridos del principal aprobados, con confirmación SMTP local, teselas OpenStreetMap reales y conciliación de ventas, stock y cupones.

## Cambios implementados

Inventario admite SKU, talla, color y material independientes, stock por sucursal y alerta cuando disponible es igual o menor al punto de pedido. Las carreras física/física y física/online usan PostgreSQL real. La cancelación adquiere el mismo bloqueo por orden que Logistics y deja una marca durable que impide despachar una proyección tardía; una orden despachada no devuelve stock ni cupón.

Catalog busca por producto, SKU y atributos, conservando filtros en la URL. Redis mantiene productos, TTL e invalidación; al recuperarse actualiza la versión oficial desde Catalog para no resucitar respuestas antiguas. Inventario conserva PostgreSQL como fuente de verdad. Dashboard identifica desconexión, recupera snapshot y ordena eventos por revisión.

Caja permite cliente opcional y precio cotizado vigente. Sin cliente registrado, Orders conserva al operador como propietario técnico para auditoría; no atribuye la venta a un perfil CUSTOMER de CRM. Las ventas físicas no crean envío. Un cliente cancela sus órdenes desde la app con confirmación explícita y las restricciones del estado de entrega.

## Certificación de una versión

La batería compartida es `node scripts/certify-release.mjs`: cuentas, negocio, navegador, seguridad HTTP, recuperación y DLQ, fases 4–7 y finalmente 30 minutos de carga de lectura. Los runners que alteran existencias o detienen servicios se ejecutan secuencialmente, exclusivamente en `departamental-five-phases`. Los fixtures se preparan también en bases nuevas de CI y se resuelven por identidad, sin depender de la primera página del catálogo.

Web y diez servicios pasan lint, tipos, pruebas y build; la auditoría de dependencias desplegadas requiere cero vulnerabilidades altas o críticas. El reporte distingue una observación sobre herramientas de desarrollo. La estabilidad define cinco lecturas API concurrentes y una página web por ronda, cada diez segundos, registrando salud, imágenes y pendientes; no acredita disponibilidad universal.

`deploy-principal-release.mjs` exige CI remoto aprobado para el mismo commit, batería local completa con estabilidad, imágenes ensayadas en restauraciones, archivo de imágenes verificado y respaldo coordinado del principal con escritores/broker detenidos, de menos de veinte minutos. Aplica migraciones por propietario, compara datos anteriores antes de reanudar consumidores, conserva la identidad y pendientes de Rabbit y comprueba las 24 imágenes exactas. Las bases/volúmenes legacy se conservan apagados.

## Recorrido universitario de entrega

La validación del principal usa un artículo Entrega universitaria, tres variantes y diez unidades de cada variante en dos sucursales. La fecha antigua del destinatario del cupón es explícitamente ficticia y se prepara solo como fixture en Auth; las tareas ordinarias se realizan desde la interfaz.

Un cliente se registra y confirma por SMTP capturado en Mailpit, compra online y cancela otra compra. Un empleado vende físicamente sin cliente. Un administrador asigna a ese empleado y prepara/despacha la compra online. El empleado publica DEMO y confirma la entrega; un administrador ve teselas OpenStreetMap reales y el cliente ve Entregado. CRM muestra el historial. Una campaña se permite solo si el segmento contiene al destinatario designado; se captura el correo, se canjea el cupón en checkout y se cancela ese pedido para restituir stock/derecho.

La conciliación verifica seis recepciones, tres órdenes online (dos canceladas), un ticket físico, una entrega, un destinatario SMTP y un canje/restauración de cupón. El artículo termina con 9/10/9 unidades disponibles en la primera sucursal y 10/10/10 en la segunda, sin reservas residuales.

## Evidencias finales

| Prueba | Reporte |
| --- | --- |
| Calidad web y diez servicios | [verification-release-quality.json](verification-release-quality.json) |
| Dependencias desplegadas | [verification-dependency-security.json](verification-dependency-security.json) |
| Inventario/concurrencia/Redis | [verification-close-seven.json](verification-close-seven.json) |
| Seis recorridos de fase 7 | [verification-phases-seven-browser.json](verification-phases-seven-browser.json) |
| Latencia venta → Dashboard | [verification-inventory-browser-latency.json](verification-inventory-browser-latency.json) |
| Batería local compartida | [verification-ci-gate.json](verification-ci-gate.json) |
| Carga de 30 minutos | [verification-stability.json](verification-stability.json) |
| GitHub Actions de la misma versión | [verification-remote-ci.json](verification-remote-ci.json) |
| Imágenes exactas y fuentes | [release-fases-7-9.json](release-fases-7-9.json) |
| Migraciones con imágenes reales | [verification-release-images-fases-7-9.json](verification-release-images-fases-7-9.json) |
| Archivo/recarga de imágenes | [verification-release-archive-fases-7-9.json](verification-release-archive-fases-7-9.json) |
| Despliegue y conservación | [verification-principal-deployment.json](verification-principal-deployment.json) |
| Siete recorridos del principal | [verification-principal-browser.json](verification-principal-browser.json) |
| Conciliación del principal | [verification-principal-consistency.json](verification-principal-consistency.json) |

## Arranque y recuperación

Principal: http://localhost:3005; Gateway http://localhost:8000; Mailpit http://localhost:18000. El aislado usa 3105/8005/18025. Contraseñas: variables `SEED_*_PASSWORD` de los archivos privados `.env` y `.env.integration`; Compose exige configuración explícita. Los reportes no incluyen tokens, contraseñas ni enlaces privados de alta.

Para principal: `docker compose -p web --env-file .env -f compose.yaml -f compose.university.yaml -f compose.release-fases-7-9.yaml up -d --no-build --wait`. No iniciar las bases legacy. Un nuevo equipo necesita recuperar configuración privada, imágenes y el punto coordinado de bases/broker; los secretos no están en Git.

El procedimiento de [recuperación coordinada](recuperacion.md) mantiene sus reglas: detener escritores/consumidores, restaurar todas las bases y Rabbit como conjunto, conservar su hostname y las imágenes compatibles, comprobar datos/colas antes de reanudar. No ejecutar `down -v`, purgar DLQ ni reemplazar ventas nuevas con un respaldo anterior después de reanudar operaciones. Los mensajes válidos de DLQ se reenvían con confirmación antes de ACK; los inválidos se conservan.

Las imágenes históricas se trasladaron, con SHA-256 verificado, a un directorio local privado por falta de espacio en la unidad de sistema. Los reportes conservan sus nombres y hashes, pero omiten la ruta local. Los respaldos y secretos permanecen fuera de Git en la ubicación privada local. Redis se reconstruye desde su propietario.

## Alcance acordado

SMTP real aceptado/capturado localmente; no entrega a buzón externo. OpenStreetMap requiere conexión para teselas. Posiciones DEMO y destino ilustrativo se identifican como ficticios; GPS se prueba con emulación de navegador, sin certificar teléfono físico. La aceptación SMTP y su persistencia tienen una ventana en que una recuperación puede duplicar un correo; no se promete entrega externa exactamente una vez.

## Incidencias resueltas durante la entrega

Rabbit confirmó el ping de Erlang un instante antes de completar el arranque de su aplicación. Se esperó `check_running`, se revalidaron el checkpoint fresco, todas las filas originales y las cuentas de las colas antes de iniciar consumidores; [primer intento](verification-principal-deployment-initial.json) y [continuación aprobada](verification-principal-deployment.json) conservan la secuencia. Dos mensajes históricos válidos de `order.completed.v1` se reenviaron con confirmación antes de ACK; la auditoría posterior encontró cero mensajes en esa DLQ. [Recuperación](verification-dlq-web-recovery.json).

La prueba de navegador del principal ajustó sus selectores a los textos reales y a la búsqueda por nombre/ID de CRM. Reanudó el escenario persistido para conservar exactamente las compras y auditorías iniciales. El [reporte consolidado](verification-principal-browser.json) conserva las referencias a los intentos anteriores. Estas correcciones afectan únicamente al harness de validación; las imágenes de aplicación permanecen idénticas a la versión certificada por CI. Lint y tipos del harness se comprobaron localmente.

Los checkpoints privados y archivos de imágenes están verificados en los reportes de respaldo/archivo. Redis no se restaura como fuente de inventario. Para reiniciar, usar el conjunto de Compose indicado, sin rebuild ni borrado de volúmenes; esperar además `docker exec web-rabbitmq-1 rabbitmq-diagnostics -q check_running` antes de validar operaciones. El servidor de desarrollo antiguo de 3000 y los contenedores legacy quedaron fuera del entorno activo.
