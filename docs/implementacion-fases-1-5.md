# Implementación de las fases 1 a 5

Fecha: 8 de octubre de 2026. Alcance: Tienda Departamental de los documentos proporcionados. Las fases 6, 7 y 8 se completaron posteriormente; véase [su implementación y evidencia](implementacion-fases-6-8.md).

## Cambios

1. Inventory aumenta una revisión de stock dentro de cada transacción. HTTP, outbox, Analytics y Realtime conservan esa revisión. Los eventos anteriores sin revisión no pueden reemplazar un estado versionado. Un trabajador libera reservas vencidas por lotes.
2. Analytics se suscribe a su cola durable antes de importar Inventory mediante una API privada y paginada. Reconcilia periódicamente, registra avance y errores, conserva sucursales vacías y agrupa las ventas de todas las variantes de un producto. El dashboard muestra barras y distribución circular de stock.
3. El dashboard consulta al conectar o reconectar, usa consultas de respaldo cada cinco segundos durante una desconexión y protege el stock ante respuestas atrasadas, cambios de sucursal y eventos recibidos mientras se carga la nueva sucursal. La URL de los sockets se obtiene del servidor durante la ejecución.
4. Pricing exige fechas con UTC o desfase explícito. El nuevo formulario administrativo `/promotions` convierte la hora de la campaña a UTC y permite crear, consultar y editar promociones; al editar conserva todos los destinos anteriores salvo que se cambie expresamente el alcance. Las horas inexistentes o repetidas por cambios de horario se rechazan. Pricing sigue calculando el precio y Orders conserva su snapshot definitivo.
5. CRM exige entre tres y sesenta meses en el backend. Resta meses calendario en `America/Mexico_City`, ajustando el día al último válido del mes. La vista previa y la confirmación usan la misma regla. Cada campaña guarda su referencia y corte; los destinatarios se recalculan al confirmar y se revisan nuevamente antes de publicar. La creación concurrente con la misma llave es idempotente. Las identidades sin compras siguen excluidas.

CRM utiliza su proyección local de compras: una compra modifica la elegibilidad una vez que su evento ha sido procesado. La revisión previa a publicación usa el corte guardado al crear la campaña. No consulta la base de Orders.

## Evidencia

- **172 pruebas automatizadas aprobadas:** 101 web y 71 entre los diez servicios.
- TypeScript aprobado en la web y los diez servicios; ESLint aprobado en la web y los cinco servicios modificados. Compilaciones Docker verificadas para la web y servicios afectados.
- **14 comprobaciones de integración** con PostgreSQL y RabbitMQ reales, más una comprobación de migraciones con registros anteriores: [integración](verification-five-phases.json), [migraciones](verification-migrations.json).
- Dos ventas físicas concurrentes sobre una última unidad producen una confirmación y un rechazo por stock. Stock final: cero unidades físicas y reservadas. La entrega del evento final a Socket.IO tardó **802 ms** desde su creación; desde el inicio de la petición de venta hasta ese evento transcurrieron **6.537 segundos**. El objetivo propuesto de tres segundos se acreditó para la propagación del evento, pero no para el flujo completo de venta. Ambas son mediciones locales.
- Una reserva vencida se liberó sin otra compra. Analytics coincidió nuevamente con Inventory después de las ventas y la liberación.
- Ranking real: dos variantes con seis unidades cada una sumaron doce en un solo producto, por encima de otro con nueve.
- Pricing se probó justo antes del inicio, en el inicio y en el instante de vencimiento; el precio funciona aunque el scheduler no haya actualizado el estado. Se comprobó la reconciliación después de reiniciar el scheduler y el precio guardado por Orders.
- Se comprobaron finales de mes, febrero, año bisiesto, cambios de horario y la independencia de la zona del dispositivo.
- CRM excluyó un cliente que compró después de la vista previa, evitó duplicados ante dos confirmaciones simultáneas y bloqueó la publicación cuando el destinatario dejó de ser elegible.
- En navegador: login, gráficas de barras y circular, creación de una promoción a las 00:00 de México, consultas de respaldo durante una interrupción de Realtime y recuperación al restablecerlo. Las respuestas atrasadas y los eventos durante un cambio de sucursal se verificaron con pruebas unitarias. [Captura de promociones](screenshots/promotions.jpg).
- En el entorno local `web`, la verificación posterior a las migraciones conservó **114 unidades en 14 registros**, y Analytics quedó con esas mismas cantidades y revisiones: [verificación local](verification-local-five-phases.json).

## Configuración

- `PUBLIC_GATEWAY_URL`: origen público entregado a los clientes de Socket.IO durante la ejecución. Compose admite la variable anterior `NEXT_PUBLIC_GATEWAY_URL` como respaldo para instalaciones existentes.
- `ANALYTICS_INVENTORY_SERVICE_KEY`: llave base64url privada compartida solo por Inventory y Analytics. Es opcional para mantener compatibilidad; si no existe, ambos derivan una llave con HMAC a partir de la configuración JWT. Nunca se entrega al navegador.
- `ANALYTICS_INVENTORY_SYNC_SECONDS`: reconciliación, treinta segundos por defecto.
- `INVENTORY_RESERVATION_SWEEP_SECONDS`: liberación de reservas, diez segundos por defecto.

Los respaldos previos están en `C:/Users/Aldo/Documents/Proyectos/ApliacionWeb/.codex-backups/2026-10-08-phases-1-5`. No se restablecieron datos de negocio ni se usaron las bases existentes como fixtures.

Durante la compilación se agotó temporalmente el espacio de C: y Docker necesitó recuperarse. Las cachés generadas de Next.js se conservaron en `G:/CodexTemporary/ApliacionWeb-phases-1-5`; los archivos temporales de comunicación de Docker se conservaron en carpetas de recuperación. Docker volvió a iniciar, la última imagen web compiló y el proyecto local quedó con sus 25 contenedores saludables. El proyecto de integración está detenido y sus volúmenes se conservan.

## Reproducir las pruebas aisladas

Desde `web`, con Node.js 22 o posterior y Docker Compose que admita `!override`:

```powershell
node scripts/setup-integration.mjs
docker compose -p departamental-five-phases --env-file .env.integration -f compose.yaml -f compose.integration.yaml up -d --wait inventory-postgres analytics-postgres pricing-postgres crm-postgres rabbitmq
foreach ($service in @('inventory-service','analytics-service','pricing-service','crm-service','realtime-service')) { npm --prefix "services/$service" run build }
node scripts/verify-five-phases.mjs --prepare
docker compose -p departamental-five-phases --env-file .env.integration -f compose.yaml -f compose.integration.yaml up -d --build --wait
node scripts/verify-five-phases.mjs
```

El script comprueba el nombre del proyecto y las etiquetas de los contenedores antes de escribir. Solo usa los puertos de pruebas `55433`, `55434`, `55437` y `55439`; sus contraseñas se generan en `.env.integration`, que Git ignora. La aplicación de pruebas usa `3105`, el Gateway `8005` y RabbitMQ `55672`. La primera inicialización de PostgreSQL puede necesitar más tiempo en equipos con poca capacidad libre; esperar a que esté saludable y repetir `up` conserva los volúmenes.

Para detener el proyecto de pruebas conservando sus datos:

```powershell
docker compose -p departamental-five-phases --env-file .env.integration -f compose.yaml -f compose.integration.yaml down
```

No se enviaron correos reales ni se validaron Maps, SMTP o canje de cupones: corresponden a las fases posteriores.
