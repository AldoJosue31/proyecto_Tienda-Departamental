# Recuperación coordinada

Esta guía describe la recuperación del conjunto de microservicios, bases y RabbitMQ. Los manifiestos enlazados corresponden a la entrega universitaria del 14 de octubre de 2026; para una instalación nueva desde el código, sigue el [README principal](../README.md).

## Artefactos y consistencia

El [respaldo principal](verification-release-web.json), el [respaldo aislado](verification-release-departamental-five-phases.json) y el [despliegue aprobado](verification-principal-deployment.json) identifican los checkpoints de la entrega. Los dumps, archivos del broker, configuración privada y `compose.baseline.yaml` se guardan fuera de Git. Consulta su manifiesto privado para localizar el conjunto completo y verificar los hashes.

El [manifiesto de entrega](release-fases-7-9.json) y `compose.release-fases-7-9.yaml` identifican las imágenes compatibles. El [reporte de archivo](verification-release-archive-fases-7-9.json) enumera la cadena de imágenes: un archivo incremental requiere también sus archivos base. Carga todos los archivos con `docker load --input <ruta-privada>` y verifica cada SHA-256. Los manifiestos de fases 1–3 y 4–6 se conservan porque las herramientas también pueden ensayar esos checkpoints; no son la versión actual de la app.

RabbitMQ requiere el hostname guardado en el entorno privado del checkpoint. Restaura su almacenamiento con el broker detenido y sus propietarios originales; cambiar el hostname puede inicializar otro nodo sin los mensajes respaldados. El respaldo principal conserva las imágenes originales para revertir como conjunto. No mezcles servicios de contratos diferentes.

Redis contiene cache reconstruible. Los volúmenes heredados se conservan y sus datos PostgreSQL también tienen dump. No se necesita borrar ni purgar volúmenes para probar o arrancar esta entrega.

## Crear un checkpoint nuevo antes de una actualización

Programa una ventana de mantenimiento, detén entrada de nuevas escrituras y espera operaciones activas. El helper pausa web, gateway, servicios, schedulers, publicadores y consumidores; comprueba mensajes sin confirmar, detiene el broker, genera dumps y archive durable, y restaura el estado de ejecución previo al finalizar. Este procedimiento causa una pausa real; debe hacerse en la ventana correspondiente.

```powershell
node scripts/backup-release.mjs --project web
```

Para ensayar trabajo pendiente usa únicamente el proyecto de datos sintéticos:

```powershell
node scripts/backup-release.mjs --project departamental-five-phases --pending-fixtures
node scripts/rehearse-release-images.mjs --phases-7-9
```

El segundo comando ensaya las imágenes exactas del manifiesto contra clones de ambos checkpoints. Cada base se restaura en tmpfs sin acceso externo; se aplican las migraciones dos veces y se comparan fingerprints de columnas/registros originales y ledgers. Auth puede actualizar `updated_at` al completar el backfill de alta; esa columna se excluye de su comparación, conservando IDs, hashes, roles, sesiones y fechas originales de creación.

El ensayo pendiente verifica conservación sin consumir el correo o los eventos. Los runners de compra verifican por separado que reentregas y reintentos de ventas confirmadas no consumen dos veces stock ni cupones.

## Actualización y reversión

1. Verifica checksums de configuración, dumps, broker e imágenes. Carga todos los archivos de imágenes requeridos con `docker load --input <ruta-privada>`. Comprueba IDs y usa el conjunto de `compose.release.yaml`, no etiquetas de desarrollo cambiantes.
2. Ensaya primero en un clon los nuevos esquemas y el arranque completo. Conserva el checkpoint previo y el manifiesto de imágenes. Usa el hostname respaldado de RabbitMQ y las variables privadas correctas para ese destino.
3. Dentro de la ventana, pausa todos los escritores y mensajes de forma coordinada. Actualiza el conjunto completo; no arranques consumidores parcialmente migrados. Arranca bases/cache/broker, servicios propietarios, Gateway y web. Verifica readiness y roles antes de reabrir escrituras.
4. Si hay que revertir antes de reabrir escrituras, restaura juntos dumps y broker del mismo checkpoint, con las imágenes exactas de `compose.baseline.yaml`. Comprueba usuarios, sesiones, stock, pedidos, outboxes, colas y ledgers antes de habilitar tráfico.
5. Si hubo escrituras posteriores, captura otro checkpoint y preserva/reconcilia sus cambios antes de usar uno antiguo. Restaurar solo una base o combinar un broker posterior con bases antiguas puede repetir trabajo o perderlo. La restauración ensayada en clones no autoriza descartar compras posteriores.

Si la carga recupera IDs sin las etiquetas del conjunto, reconstruye las etiquetas desde el manifiesto verificado antes de usar `compose.release.yaml`:

```powershell
$releaseManifest = Get-Content -LiteralPath 'docs/release-fases-7-9.json' -Raw | ConvertFrom-Json
foreach ($releaseImage in $releaseManifest.images) {
  docker tag $releaseImage.imageId $releaseImage.tag
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo recuperar una imagen de la entrega' }
}
```

El [acta de entrega](entrega-definitiva-fases-7-9.md) registra el despliegue y las comprobaciones de conservación. Los ensayos de restauración se realizaron en clones; no constituyen una reversión del principal.

## Fallos temporales y DLQ

La política de reinicio recupera un proceso que termina. Un proceso vivo y `unhealthy` puede estar esperando una dependencia: verifica primero PostgreSQL, RabbitMQ y sus healthchecks. Precios reintenta conexiones/outbox y responde 503 mientras PostgreSQL no está disponible. Kong tarda unos segundos en resolver una nueva dirección después de recrear un servicio; su caché DNS está acotada a cinco segundos.

Los consumidores reintentan eventos válidos con backoff y límite, preservando IDs. El original se confirma solo después de confirmar su copia en el broker. Los errores de contenido quedan en DLQ; no purgues una cola como sustituto de resolver la causa.

```powershell
node scripts/audit-projection-dlq.mjs
node scripts/audit-projection-dlq.mjs --recover-valid
node scripts/audit-projection-dlq.mjs --business
```

El primer comando inspecciona la DLQ aislada sin exportar payloads; el segundo reenvía solo los válidos, confirma antes de ACK y conserva inválidos. El tercero audita el principal. Añadir `--business --recover-valid` exige que **todos** sus servicios y Kong coincidan con las imágenes compatibles del manifiesto; si las imágenes no coinciden debe rechazar la acción. Usa además `--phases-7-9` para validar contra el manifiesto de la entrega final. Los ledgers deduplican eventos ya procesados.

Si SMTP aceptó un correo y el proceso cayó antes de registrar esa aceptación, un reintento puede entregarlo otra vez. Conserva estados e IDs y reconcílialos con el proveedor; el sistema no promete exactamente una entrega SMTP.
