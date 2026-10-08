# Implementación de las fases 6 a 8

Fecha: 8 de octubre de 2026. Complementa la [implementación de las fases 1 a 5](implementacion-fases-1-5.md) y el [plan de cumplimiento](plan-cumplimiento-requisitos.md).

## Notification y campañas

- El modo `log` registra `SIMULATED` y publica `notification.simulated.v1`. Nunca acredita envío por SMTP.
- `SENT` significa que el servidor SMTP aceptó el destinatario. CRM muestra «Aceptados por SMTP», simulados, fallos, pendientes e históricos sin verificar. No acredita recepción final ni lectura del correo.
- El proveedor valida remitente y configuración, tiene límites de tiempo y comprueba aceptación del destinatario. Notification revisa la vigencia antes del envío, conserva deduplicación y outbox, limita reintentos y recupera trabajos tras reinicios. Los resultados incluyen número de intento para impedir que un fallo atrasado revierta un resultado posterior.
- La migración corrige envíos históricos de modo log en Notification; los anteriores estados de CRM sin evidencia del proveedor pasan a `UNKNOWN`. Las campañas antiguas sin definición del descuento se cierran como no entregables, en lugar de enviar códigos que no puedan canjearse.
- Notification tiene una red de salida SMTP; las bases y RabbitMQ conservan sus redes privadas. El entorno aislado utiliza Mailpit para capturar mensajes a direcciones sintéticas.

## Reglas del cupón

El canje es la ampliación aprobada en el plan; los documentos originales pedían el envío del cupón sin definir sus reglas de uso.

1. La campaña debe indicar descuento porcentual o importe fijo, valor con hasta dos decimales, alcance y vigencia con zona explícita. El porcentaje admite hasta 100; el importe fijo se expresa en MXN y se aplica por unidad, limitado al precio del artículo.
2. Pricing es propietario de la definición y los derechos. CRM recalcula elegibilidad y confirma la emisión del derecho mediante API privada antes de publicar el correo. El código identifica una única definición de campaña.
3. Un derecho pertenece a un cliente y admite un uso. Checkout resuelve identidad, catálogo y precios en el servidor; el cliente no elige el propietario del cupón ni fija el precio confirmado.
4. El alcance admite todos los artículos, categoría, producto o variante. Se aplica por artículo el mejor precio entre promoción y cupón, sin acumular ambos descuentos. Se admite un código por pedido.
5. Pricing reserva el derecho atómicamente por pedido. Orders conserva código y precios definitivos en su snapshot. Los reintentos de un pedido conservan reserva y precio original aun si cambia el catálogo.
6. La falta de stock libera el derecho. Una cancelación aceptada antes del despacho lo restituye con la vigencia original. Pricing reconcilia reservas y usos mediante la API privada de Orders, sin consultar su base de datos.
7. Las APIs internas tienen credenciales por propósito y no están publicadas en Kong. Las campañas y pedidos conservan claves de idempotencia.

## Mapas

El seguimiento muestra repartidor, dirección, ruta y marcador de destino. Descarta ubicaciones anteriores a la última observada y vuelve a evaluar la antigüedad de la señal cada 30 segundos, incluso sin nuevos eventos. A partir de cinco minutos se identifica como ubicación anterior. Los errores de carga o autorización de Google Maps muestran un estado alternativo que conserva la dirección y la operación de Pick & Pack.

Google Routes respondió HTTP 200 con las claves existentes y una dirección y coordenadas públicas de prueba en Ciudad de México. La evidencia técnica no contiene claves: [verificación del proveedor](verification-google-provider.json). Las credenciales solo se utilizan desde archivos locales ignorados por Git.

La comprobación en navegador acreditó Google Maps desde `http://localhost:3105`: repartidor, ruta de 635 m y destino visibles, señal antigua y actualización reciente por socket. Se corrigió la carga de `LatLngBounds` desde la biblioteca `core`, según la [referencia oficial de Google](https://developers.google.com/maps/documentation/javascript/reference/coordinates). [Mapa](screenshots/tracking-map.jpg) y [señal antigua](screenshots/tracking-map-stale.jpg).

## Verificación reproducible

- 188 pruebas unitarias aprobadas: 105 de la web y 83 entre los diez servicios.
- TypeScript y compilación de los diez servicios; lint de la web y los siete servicios modificados. Compilación de producción de Next.js y de las imágenes Docker afectadas.
- 14 comprobaciones reales de las fases 1 a 5 repetidas con el código final: [resultados](verification-five-phases.json).
- 13 comprobaciones reales de las fases 6 a 8: SMTP capturado con destinatario/código/vigencia, identidad, emisión privada, concurrencia de canje, cancelación, checkout y replay, falta de stock, reconciliación interrumpida, reintentos, simulación, expiración, reinicio de Notification, logística por rol e historial CRM: [resultados](verification-final-phases.json).
- En navegador se inició sesión como administrador y cliente sintético, se procesó una [campaña con SMTP capturado](screenshots/crm-smtp.jpg), se confirmó una [compra con descuento](screenshots/checkout-confirmed.jpg) de $2,899 a $2,319.20, se asignó reparto y se pasó por empaque, despacho y entrega. La [venta física de la última unidad](screenshots/physical-sale-exhausted.jpg) mostró automáticamente AGOTADO. Se corrigió el filtro de ventas físicas para aceptar el contrato público de Catalog, que omite el estado administrativo de sus variantes activas.
- Las nueve comprobaciones de navegador están registradas en [resultados del navegador](verification-browser.json), con evidencia del [dashboard](screenshots/dashboard-verified.jpg) y del [historial CRM](screenshots/crm-history.jpg).
- La actualización del entorno local conservó sus 114 unidades en 14 registros, con Analytics y sus revisiones coincidentes y 25 contenedores saludables. [Verificación local](verification-local-five-phases.json). Los respaldos previos de Orders, Pricing, CRM y Notification están fuera del repositorio en `.codex-backups/2026-10-08-phases-6-8`.
- GitHub Actions ejecuta lint, TypeScript, pruebas y build de la web, además de TypeScript, pruebas y build de los diez servicios en las ramas `develop`, `main` y los PR dirigidos a `main`.

Para reproducir las integraciones desde `web`, preparar `.env.integration` con `node scripts/setup-integration.mjs`, compilar los servicios localmente y ejecutar:

```powershell
docker compose --env-file .env.integration -f compose.yaml -f compose.integration.yaml up -d --build --wait
node scripts/verify-five-phases.mjs --prepare
node scripts/verify-five-phases.mjs
node scripts/verify-final-phases.mjs
```

Los runners verifican el nombre del proyecto Compose y usan exclusivamente puertos de PostgreSQL en loopback del entorno `departamental-five-phases`. Sus ventas, cambios de stock y campañas son fixtures de ese entorno. Mailpit está en `http://localhost:18025`; la web de pruebas en `http://localhost:3105`.

## Dependencias externas y límites

El proyecto local conserva el modo `log` cuando no existe proveedor SMTP configurado. El código y el protocolo SMTP están comprobados contra Mailpit; enviar a destinatarios reales requiere definir `NOTIFICATION_DELIVERY_MODE=smtp`, `SMTP_URL` y un remitente autorizado en `NOTIFICATION_FROM_EMAIL`. No se enviaron campañas a clientes reales durante estas pruebas.

SMTP no ofrece una transacción conjunta con PostgreSQL: un corte entre aceptación SMTP y persistencia puede exigir reintento. Se utiliza un Message-ID estable y deduplicación local, sin prometer recepción exactamente una vez. Maps y Routes requieren claves habilitadas y orígenes autorizados para cualquier despliegue diferente del comprobado.
