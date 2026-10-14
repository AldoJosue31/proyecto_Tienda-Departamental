# Recuperación coordinada de las fases 1 a 3

Fecha: 13 de octubre de 2026. Los ensayos descritos restauraron clones; no reemplazaron datos del principal. La instalación definitiva pertenece a la fase 9.

## Artefactos y consistencia

Consulta los directorios privados y hashes en [respaldo principal](fases-1-3-verification-release-web.json) y [respaldo de pruebas](verification-release-fases-1-3-departamental-five-phases.json). Cada checkpoint contiene diez dumps PostgreSQL, almacenamiento durable de RabbitMQ, manifiesto privado, configuración del entorno y `compose.baseline.yaml`. Los archivos de imágenes aparecen en [el reporte de archivo](fases-1-3-verification-release-archive.json). Si el archivo es incremental, **se necesitan ambos archivos**: carga primero el base y después el complemento. Cada SHA-256 debe coincidir con su reporte.

El [manifiesto de entrega](release-fases-1-3.json) y `compose.release.yaml` identifican la candidata compatible. El respaldo principal conserva sus imágenes originales para revertir como conjunto. No mezcles servicios de identidad nuevos con servicios que usan contratos anteriores.

Los checkpoints de RabbitMQ requieren el hostname original: principal `b807706f5fa7`, pruebas `d1610e289a0b`. El entorno privado conserva ese valor. Restaura el almacenamiento con RabbitMQ detenido y sus propietarios originales; cambiar el hostname puede hacer que el broker inicialice otro nodo y no encuentre los mensajes respaldados.

Redis contiene cache reconstruible. Los volúmenes heredados se conservan y sus datos PostgreSQL también tienen dump. No se necesita borrar ni purgar volúmenes para probar o arrancar esta entrega.

## Crear un checkpoint nuevo antes de una actualización

Programa una ventana de mantenimiento, detén entrada de nuevas escrituras y espera operaciones activas. El helper pausa web, gateway, servicios, schedulers, publicadores y consumidores; comprueba mensajes sin confirmar, detiene el broker, genera dumps y archive durable, y restaura el estado de ejecución previo al finalizar. Este procedimiento causa una pausa real; debe hacerse en la ventana correspondiente.

```powershell
node scripts/backup-release.mjs --project web
```

Para ensayar trabajo pendiente usa únicamente el proyecto de datos sintéticos:

```powershell
node scripts/backup-release.mjs --project departamental-five-phases --pending-fixtures
node scripts/rehearse-release-images.mjs
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
$releaseManifest = Get-Content -LiteralPath 'docs/release-fases-1-3.json' -Raw | ConvertFrom-Json
foreach ($releaseImage in $releaseManifest.images) {
  docker tag $releaseImage.imageId $releaseImage.tag
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo recuperar una imagen de la entrega' }
}
```

No se ejecutó una reversión del principal ni se migraron sus bases en esta entrega. Se ensayaron datos y broker preservados, migraciones repetibles y conservación de imágenes como piezas de la recuperación coordinada.

## Fallos temporales y DLQ

La política de reinicio recupera un proceso que termina. Un proceso vivo y `unhealthy` puede estar esperando una dependencia: verifica primero PostgreSQL, RabbitMQ y sus healthchecks. Precios reintenta conexiones/outbox y responde 503 mientras PostgreSQL no está disponible. Kong tarda unos segundos en resolver una nueva dirección después de recrear un servicio; su caché DNS está acotada a cinco segundos.

Los consumidores reintentan eventos válidos con backoff y límite, preservando IDs. El original se confirma solo después de confirmar su copia en el broker. Los errores de contenido quedan en DLQ; no purgues una cola como sustituto de resolver la causa.

```powershell
node scripts/audit-projection-dlq.mjs
node scripts/audit-projection-dlq.mjs --recover-valid
node scripts/audit-projection-dlq.mjs --business
```

El primer comando inspecciona la DLQ aislada sin exportar payloads; el segundo reenvía solo los válidos, confirma antes de ACK y conserva inválidos. El tercero audita el principal. Añadir `--business --recover-valid` exige que **todos** sus servicios y Kong coincidan con las imágenes compatibles del manifiesto; antes de la fase 9 debe rechazar la acción. Los ledgers deduplican eventos ya procesados.

Si SMTP aceptó un correo y el proceso cayó antes de registrar esa aceptación, un reintento puede entregarlo otra vez. Conserva estados e IDs y reconcílialos con el proveedor; el sistema no promete exactamente una entrega SMTP.

## Arranque de Docker Desktop observado en Windows

Durante la validación, el motor quedó inaccesible y Desktop falló al renombrar `sailor-ingest.sock`. Los intentos de eliminar ese socket desde la sesión del agente también recibieron error 1920. Abrir Docker Desktop a través de Windows Explorer permitió el arranque; se comprobaron después los contenedores e imágenes originales. No se movieron carpetas, se borraron discos ni se reinicializaron volúmenes. El fallo es compatible con el [reporte de arranque en contexto MSIX](https://github.com/openai/codex/issues/52698); esa causa no se diagnosticó de forma concluyente en esta máquina.

Si vuelve a ocurrir, abre Docker Desktop desde Windows y espera la respuesta de `docker info`. No utilices Reset to factory defaults para este fallo de socket: elimina el estado persistente. Tras recuperar el motor, arranca los contenedores existentes del principal con `docker start` y comprueba sus IDs; un `compose up --build` con el código nuevo sería una actualización que corresponde a la fase 9.

Al reanudar el cierre de fases 4–6, la API de Docker volvió a bloquearse mientras la web aún respondía. Se reinició Desktop desde su instalación por usuario mediante Explorer y se recuperó el motor. Los 25 contenedores del principal se arrancaron con sus mismas imágenes, verificadas contra el checkpoint; nueve servicios sin política de reinicio antigua necesitaron otro arranque después de que sus bases estuvieran listas. No se recrearon contenedores del principal ni se borraron volúmenes. El conjunto de fases 4–6 quedó desplegado únicamente en el candidato aislado.
