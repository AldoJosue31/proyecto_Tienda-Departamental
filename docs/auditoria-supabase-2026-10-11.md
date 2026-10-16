# Auditoría de compatibilidad del proyecto con Supabase

Fecha de evaluación: 11 de octubre de 2026, America/Mexico_City.

**Dictamen: la migración de las nueve bases de negocio a PostgreSQL administrado por Supabase es técnicamente viable conservando Kong, los diez microservicios Docker, Redis, RabbitMQ, Socket.IO y la lógica de negocio. El despliegue actual necesita ajustes antes de poder utilizar bases remotas.** La auditoría verifica compatibilidad mediante código, metadatos y pruebas ejecutadas; no certifica todavía el funcionamiento completo del sistema contra nueve proyectos Supabase alojados.

La ruta que mantiene la interpretación estricta de los Word es un proyecto Supabase independiente por cada servicio propietario de datos. La UI sigue entrando por Kong y cada servicio conserva sus APIs y su propia base. Realtime continúa consumiendo eventos y no necesita una base de negocio. No es necesario adoptar Supabase Auth, su SDK de frontend, sus Edge Functions ni su Realtime para esta migración.

## Alcance y método

Se tomaron como requisitos los dos Word proporcionados, con foco en Tienda Departamental y requisitos generales. Se contrastaron con `compose.yaml`, `compose.integration.yaml`, conexiones `pg`, migraciones, arranque de contenedores, inventario, pedidos, precios, outbox, Auth y clientes del gateway.

Se consultaron los contenedores en ejecución y metadatos de sus bases PostgreSQL mediante operaciones de lectura. La cuenta Supabase conectada tiene un proyecto saludable; se consultaron únicamente versión, privilegios, extensiones y permisos predeterminados. No se leyeron datos de usuarios de Supabase ni archivos `.env`.

Las escrituras de prueba se realizaron exclusivamente en contenedores PostgreSQL 17 temporales, con bases y datos sintéticos. Se eliminaron esos contenedores al finalizar. Las aplicaciones, las bases actuales, sus volúmenes, las credenciales y el proyecto alojado no se migraron ni se modificaron.

## Inventario técnico verificado

El stack actual ejecuta PostgreSQL 16.15, distribuido en nueve bases de negocio más una base heredada. Kong funciona en modo DB-less. Los servicios usan NestJS y el driver `pg`, con SQL propio y migraciones por servicio; el frontend oficial obtiene los datos de inventario por el gateway.

| Servicio propietario | Migraciones | Tablas actuales, incluyendo su registro de migraciones | Compatibilidad comprobada |
| --- | ---: | ---: | --- |
| Auth | 2 | 10 | Esquema y migraciones; pruebas existentes de cuentas, tokens y permisos |
| Catalog | 1 | 6 | Esquema y migraciones; pruebas existentes; Redis conserva su función |
| Inventory | 3 | 10 | Reserva, concurrencia, idempotencia, liberación, rollback y outbox reales |
| Pricing | 3 | 7 | Activación por fecha, idempotencia del cambio y evento transaccional reales |
| Orders | 5 | 6 | Migraciones y bloqueo de sesión real; pruebas existentes de pedidos |
| Analytics | 2 | 8 | Esquema y migraciones; pruebas existentes de proyecciones |
| Logistics | 3 | 7 | Esquema y migraciones; pruebas existentes de preparación y seguimiento |
| CRM | 4 | 9 | Esquema y migraciones; pruebas existentes de campañas |
| Notification | 3 | 7 | Esquema y migraciones; pruebas existentes de entregas |
| Total | 26 | 70 | Nueve propietarios independientes |

Los nombres de las migraciones aplicadas y los conteos de tablas coinciden entre las bases en ejecución y los esquemas creados para la prueba. Esto verifica el registro de migraciones y el conteo de tablas; no sustituye una comparación completa de todos los objetos ni una restauración de datos históricos.

El proyecto Supabase consultado ejecuta PostgreSQL 17.6, sin privilegios de superusuario para `postgres`, y tiene `pgcrypto` en el esquema `extensions`. La prueba local ejecutó PostgreSQL 17.11, colocó `pgcrypto` en `extensions` y aplicó las migraciones con roles `NOSUPERUSER NOCREATEDB NOCREATEROLE`. La dependencia SQL detectada es compatible con ese entorno; no se detectaron operaciones que requieran acceso al sistema de archivos del servidor o extensiones externas para los esquemas de negocio.

## Pruebas ejecutadas

Las 26 migraciones originales pasaron en dos perfiles: tablas en `public` y tablas en un esquema privado `app_private`. Fueron 18 combinaciones de servicio y perfil. Se ejecutó de nuevo el migrador real en cada combinación y el registro de migraciones permaneció sin cambios. El perfil privado configuró `search_path` por rol y base; no se modificaron las consultas ni las migraciones de los servicios.

También pasaron las 196 pruebas existentes, distribuidas en 43 archivos de los diez microservicios. Estas pruebas incluyen mocks y verifican la lógica actual; no se contabilizan como pruebas de integración contra Supabase.

Se ejecutaron seis verificaciones adicionales con las clases reales de los servicios y PostgreSQL 17:

1. **Última unidad:** veinte reservas simultáneas con claves distintas produjeron una reserva exitosa y diecinueve errores `OUT_OF_STOCK`. Repetir la reserva no añadió eventos. Confirmar dos veces con la misma clave no descontó stock dos veces.
2. **Liberación:** devolver una reserva permitió reservar nuevamente la unidad.
3. **Rollback:** un fallo inyectado después de escribir un evento revirtió conjuntamente stock, reserva y outbox.
4. **Outbox:** dos trabajadores reales reclamaron lotes diferentes usando `FOR UPDATE SKIP LOCKED`, sin repetir eventos.
5. **Pedidos:** ocho operaciones concurrentes con la misma llave de bloqueo de sesión entraron de una en una y terminaron sin dejar bloqueos activos.
6. **Precios:** una promoción de medianoche en America/Mexico_City no se activó antes de su fecha, se activó en el límite UTC correspondiente y una segunda conciliación no duplicó su evento.

El endpoint `/health` a través de Kong respondió HTTP 200. Esto confirma esa ruta de salud y Auth; no representa por sí solo una prueba de compra completa.

## Hallazgos que deben resolverse antes de migrar

| Prioridad | Hallazgo | Consecuencia y ajuste necesario |
| --- | --- | --- |
| Alta | Compose fija nueve `DATABASE_URL` a hosts PostgreSQL locales | Introducir una URL independiente por servicio y un perfil Compose para bases remotas. Cambiar `.env` por sí solo no sustituye las URLs actuales. |
| Alta | Hay dependencias de arranque hacia los PostgreSQL locales | Ajustar `depends_on` para el perfil remoto. Conservar las dependencias de APIs y RabbitMQ, y usar la salud de cada servicio para comprobar su conexión remota. |
| Alta | No todos los servicios tienen salida de red | Añadir una red de salida para los servicios que poseen bases. Mantener privadas sus APIs, sin publicar sus puertos. |
| Alta | Pedidos usa bloqueos de sesión | Elegir conexión directa o Supavisor en modo sesión. El pooler transaccional no conserva el estado requerido por el código actual. |
| Alta | Las migraciones no incorporan RLS ni permisos de Supabase | Preparar esquema privado, roles limitados y accesibilidad de la Data API antes de cargar las tablas. Evitar una ruta alternativa que omita Kong y los controles de Auth. |
| Alta | Compose no inyecta `DATABASE_SSL` | Configurar SSL explícitamente y verificar confianza del certificado desde el contenedor. El código ya admite verificación del certificado; falta validar la conexión alojada. |
| Media | Cada servicio fija su pool en diez conexiones | Dimensionar conexiones por proyecto, réplicas y procesos de migración. Un único proyecto compartido podría acumular hasta noventa conexiones de aplicación, además de las conexiones internas de Supabase. |
| Media | Migraciones automáticas y semillas forman parte del arranque | Para el corte, usar migración controlada y semillas desactivadas. Las semillas actuales son de desarrollo y pueden insertar datos de demostración o actualizar proyecciones. |
| Media | El frontend conserva una dependencia de PostgreSQL heredado | Mantener temporalmente esa base o auditar su retiro por separado. Las nueve bases de negocio no incluyen ese recurso heredado. |

### Redes y conexión

El Compose base limita las redes de negocio con `internal: true`. El perfil de integración añade una red de salida a Auth, Inventory, Pricing y Orders. Notification tiene una red de salida propia. Catalog, Analytics, Logistics y CRM no tienen salida en el stack actual.

La sonda de Catálogo no pudo resolver `supabase.com` y devolvió `EAI_AGAIN`. Pedidos y Notification pudieron establecer TCP a `supabase.com:443`. Estas sondas verifican salida de red general; no prueban acceso al puerto PostgreSQL ni TLS del destino final.

Para Docker en una red IPv4, el modo sesión del pooler es la opción inicial más compatible con el código de Pedidos. La conexión directa requiere que la red admita el endpoint correspondiente. El host y el usuario del pooler deben tomarse del diálogo Connect de cada proyecto; no deben construirse por suposición. Supabase documenta que los bloqueos de sesión y otros estados no sobreviven entre transacciones en modo transaccional. [Guía oficial de conexiones](https://supabase.com/docs/guides/database/connecting-to-postgres).

Las conexiones actuales usan `ssl: { rejectUnauthorized: true }` cuando `DATABASE_SSL=true`. Para el perfil remoto debe proporcionarse una CA confiable si el certificado del destino la requiere, por ejemplo mediante una configuración de confianza de Node o del driver. No se verificó todavía el intercambio TLS desde los contenedores contra las bases de destino.

### Seguridad de tablas y gateway

El backend actual autoriza mediante JWT propios, roles, consultas privadas a Auth y llaves internas de servicio. Esa autorización puede conservarse usando PostgreSQL remoto. Supabase Auth no es necesario para almacenar `auth_users`, refresh tokens y demás tablas actuales.

Para una migración exclusivamente de almacenamiento, desactivar la Data API y colocar tablas de negocio en un esquema no expuesto evita crear otra entrada pública de datos. Las clases existentes funcionaron con `app_private` y `search_path` configurado, sin cambios de lógica. Deben verificarse también permisos de tablas, secuencias y funciones, así como cualquier esquema que permanezca expuesto. Si se expone una tabla, requiere RLS y políticas coherentes con el modelo de autorización. No debe añadirse una política basada en `auth.uid()` suponiendo que reconoce automáticamente los JWT propios actuales. [Seguridad de la Data API](https://supabase.com/docs/guides/api/securing-your-api).

En el proyecto alojado consultado, los permisos predeterminados de `postgres` en `public` conceden acceso a `service_role`; no se observaron concesiones predeterminadas a `anon` o `authenticated` en esa consulta. Por tanto, esta auditoría no afirma que el proyecto existente tenga acceso anónimo a nuevas tablas. Los permisos de cada proyecto de destino deben comprobarse antes de importar; los valores predeterminados pueden variar.

### Bases independientes y costo

Un proyecto por propietario conserva el aislamiento actual y la lectura estricta de “Bases de Datos Independientes” de los Word. Los identificadores entre dominios continúan siendo referencias lógicas y las proyecciones se alimentan por APIs y eventos.

Un proyecto compartido con nueve esquemas y nueve credenciales puede lograr aislamiento lógico, pero no conserva literalmente las nueve bases actuales. Además, compartiría recursos y capacidad de conexión. Esa alternativa necesita aceptación de quien evalúa el requisito y una auditoría adicional de permisos entre esquemas. Las pruebas de este informe usaron bases distintas por propietario; no certifican la alternativa compartida.

Se encontró un proyecto Supabase disponible en la cuenta conectada, no nueve destinos ya preparados para esta aplicación. El plan gratuito limita a dos proyectos activos. La separación completa requiere considerar un plan de pago o una migración parcial que deje otros propietarios en PostgreSQL local. [Precios oficiales](https://supabase.com/pricing).

### Límites actuales que la migración conservaría

El reconciliador de promociones usa un intervalo de treinta segundos en Compose. La prueba confirma el límite temporal de la lógica, pero no una ejecución exactamente en el segundo 00:00:00: el cambio persistido puede esperar al siguiente tick. Esto es una característica actual y no una incompatibilidad de Supabase.

La actualización del Dashboard sigue dependiendo de RabbitMQ, consumidores, Socket.IO y reconexión. Tras migrar debe medirse su latencia real; la compatibilidad SQL no garantiza por sí sola el requisito de actualización en segundos.

## Ruta de implementación propuesta

1. Preparar una base de destino por propietario, su esquema privado y credenciales; mantener la Data API desactivada para el uso exclusivo desde backend.
2. Añadir un perfil Compose remoto con URLs por servicio, SSL, red de salida y dependencias de arranque compatibles. Preservar los contratos del gateway y las conexiones de Redis, RabbitMQ y Socket.IO.
3. Ensayar en destinos de prueba la restauración por servicio, incluyendo datos, enums, funciones, triggers, restricciones, secuencias, índices y registros de migraciones. No restaurar indiscriminadamente roles ni esquemas internos de Supabase.
4. Conservar los secretos propios de JWT y cifrado de onboarding. Configurar migraciones controladas y semillas desactivadas. Cambiar la ubicación de una base no implica regenerar contraseñas de usuarios ni adoptar otra autenticación.
5. Ejecutar el flujo completo en staging: login, refresh, revocación, catálogo y Redis, checkout simultáneo, repetición idempotente, compensación de inventario, publicaciones de outbox, proyecciones, Dashboard, logística y campañas.
6. Medir latencia y conexiones, probar una caída de PostgreSQL remoto y su recuperación, y comprobar que las tablas no son accesibles mediante una entrada pública alternativa.
7. Realizar el corte con un mecanismo definido para impedir escrituras divergentes y con una estrategia de retorno que considere todas las escrituras posteriores al corte. Conservar el respaldo original hasta validar el resultado.

Los cambios previstos son de despliegue, conexión, permisos y transferencia de datos. No se detectó una necesidad de reescribir las reglas de inventario, pedidos o precios para la ruta propuesta.

## Evidencia y reproducción

- [Compatibilidad y pruebas con PostgreSQL 17](./auditoria-supabase-verificacion-2026-10-11.json).
- [Estado real del stack y sondas de red](./auditoria-supabase-estado-actual-2026-10-11.json).
- [Pruebas existentes de los diez servicios](./auditoria-supabase-pruebas-unitarias-2026-10-11.json).

Desde `web`, `node scripts/audit-supabase-compatibility.mjs` reproduce las pruebas aisladas. Requiere Docker y las dependencias locales ya instaladas. Usa una instancia nueva de `postgres:17-alpine`, un puerto aleatorio ligado a localhost, roles sin superusuario y eliminación del contenedor exacto creado en esa ejecución. El helper de runtime está en `services/audit-tools`, fuera de la compilación de Next.js. El archivo JSON registra versión e imagen efectivamente probadas.

Referencias de código principales: `compose.yaml:86`, `compose.yaml:202`, `compose.yaml:257`, `compose.yaml:310`, `compose.yaml:676`; `services/inventory-service/src/inventory/inventory.service.ts:184`; `services/inventory-service/src/events/outbox.service.ts:98`; `services/orders-service/src/database/database.service.ts:40`; `services/pricing-service/src/pricing/pricing.service.ts:201`; `infra/kong/docker-entrypoint.sh:50`; `src/lib/inventory/dashboard.server.ts:80`.

**Pendiente para autorizar un corte real:** restauración histórica, TLS y autenticación desde Docker a los destinos, aislamiento y permisos finales, carga y latencia, recuperación de fallos, y verificación integral contra Supabase. Estas comprobaciones necesitan los proyectos de destino y una implementación de staging; no están sustituidas por las pruebas locales ni por las consultas realizadas con el conector.
