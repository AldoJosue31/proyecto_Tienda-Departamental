# Alta de cuentas: implementación de las fases 1–5

Fecha: 9 de octubre de 2026.

Estado de este punto de control: **fases 1–5 implementadas y verificadas**, incluyendo ejecución real con Docker, PostgreSQL, RabbitMQ, Kong y Mailpit. La implementación posterior de pantallas y el cierre de las fases 6–8 se describen en [alta-cuentas-entrega-y-demostracion.md](alta-cuentas-entrega-y-demostracion.md).

El alcance corresponde a [plan-alta-cuentas.md](plan-alta-cuentas.md), independiente de las fases anteriores de cumplimiento de los Word. No incluye commit, push, PR ni merge para este módulo.

## Comportamiento implementado

Un registro público crea únicamente un cliente pendiente de confirmar su correo. Un administrador puede invitar un empleado; la invitación no tiene contraseña y el empleado establece la suya al aceptarla. Ninguno de estos flujos crea administradores.

Auth conserva la propiedad de usuarios, roles, desafíos, sesiones, habilitación y auditoría. Notification envía el correo mediante un flujo separado de las campañas de cupones. Los servicios de negocio consultan el estado de Auth por API privada, sin leer su base.

| Fase | Implementación verificada |
| --- | --- |
| 1 | Estado de alta, correo confirmado, versión de identidad, desafíos, auditoría, límites persistentes y outbox transaccional. |
| 2 | Eventos cifrados de onboarding, autorización privada antes del envío, entregas independientes y resultados recibidos por Auth. |
| 3 | Registro, reenvío y confirmación de clientes; adaptación de login y refresh. |
| 4 | Listado, invitación, reenvío, aceptación y habilitación de empleados. |
| 5 | Rutas de Kong, adaptadores BFF, CSRF, IP autenticada, JWT versionado y validación de APIs y sockets. |

## Modelo y compatibilidad

La migración services/auth-service/migrations/002_account_onboarding.sql incorpora:

- onboarding_status: PENDING_EMAIL, PENDING_INVITATION o READY.
- email_verified_at, verification_source, created_by y auth_version.
- Contraseña opcional únicamente para un empleado pendiente de invitación.
- Tablas auth_onboarding_challenges, auth_onboarding_audit, auth_onboarding_outbox, auth_onboarding_received_events, límites por IP/correo y resultados idempotentes de invitación.

Una identidad autoriza sesiones cuando está habilitada, tiene estado READY, correo confirmado y contraseña establecida. Un correo enviado o simulado no cambia su estado de alta.

Las cuentas existentes conservan ID, nombre, correo, hash de contraseña, rol e historial. La migración asigna estado READY, versión cero y origen LEGACY_MIGRATION; añade una auditoría administrativa. Este origen no demuestra una verificación histórica del buzón.

Cada desafío tiene propósito, generación, hash SHA-256 del token, vencimiento, consumo y revocación. Un índice permite un solo desafío actual por usuario y propósito. La aceptación bloquea usuario y desafío dentro de la misma transacción; dos aceptaciones simultáneas no generan dos activaciones. Los reenvíos revocan las generaciones previas.

Los tokens usan 32 bytes aleatorios y se almacenan como hash en los desafíos. El outbox guarda el contenido necesario para el correo cifrado con AES-256-GCM; identificador del desafío, propósito y generación forman sus datos autenticados. La auditoría conserva actor, usuario, acción, fecha y correlation ID, sin contraseña ni enlace.

## API de Auth y BFF

Los contratos públicos de Auth pasan por Kong. Los contratos privados no se publican en la pasarela.

| Auth | BFF | Acceso y resultado |
| --- | --- | --- |
| POST /auth/register | POST /api/auth/register | Público. Nombre, correo, contraseña, browserNonce y returnPath opcional en Auth. El BFF genera el nonce. Respuesta genérica 202. |
| POST /auth/email-verification/resend | POST /api/auth/email-verification/resend | Público. Correo; respuesta genérica 202, sin revelar cuentas existentes. |
| POST /auth/email-verification/confirm | POST /api/auth/email-verification/confirm | Token, browserNonce opcional y contraseña opcional en Auth. BFF toma nonce de su cookie. Devuelve 200 y destino local seguro. |
| POST /auth/employee-invitations/accept | POST /api/auth/employee-invitations/accept | Token y contraseña. Propósito de empleado; aceptación única, 200. |
| GET /auth/employees | GET /api/auth/employees | ADMIN; page, pageSize y search. Lista, estados, versión y resultado del correo. |
| POST /auth/employees/invitations | POST /api/auth/employees/invitations | ADMIN; nombre, correo e Idempotency-Key. Empleado pendiente, 202. |
| POST /auth/employees/:id/invitation/resend | POST /api/auth/employees/:id/invitation/resend | ADMIN; cuerpo vacío. Solo empleado pendiente y habilitado, 202. |
| PATCH /auth/employees/:id/status | PATCH /api/auth/employees/:id/status | ADMIN; isActive y authVersion. Control de versión, 200. |
| GET /internal/auth/users/:id/status | No se publica | Credencial privada de estado. Devuelve user con id, role, isActive y authVersion. |
| POST /internal/auth/onboarding-deliveries/authorize | No se publica | Credencial privada de Notification; comprueba desafío, usuario, propósito, generación y vigencia antes del envío. |

GET /api/auth/onboarding/context prepara una cookie HTTP-only de CSRF y devuelve el token que la interfaz deberá enviar en X-CSRF-Token.

Las DTO y los esquemas BFF rechazan campos adicionales. Una solicitud pública no puede asignar role, isActive, emailVerifiedAt o authVersion. Un token de cliente no acepta una invitación de empleado.

Los contratos de empleados comprueban ADMIN tanto en el BFF como en Auth. EMPLOYEE y CUSTOMER reciben 403. Invitar un correo ya existente devuelve 409 sin convertir su rol. La misma clave idempotente y el mismo cuerpo devuelven la misma operación; cambiar el cuerpo con esa clave devuelve 409.

## Contraseñas, nonce y seguridad del navegador

Las contraseñas nuevas requieren al menos 15 caracteres y un máximo de 72 bytes UTF-8. Se mantienen frases y bcrypt, sin truncamiento. La validación nueva no rechaza contraseñas antiguas durante el login.

El BFF conserva cookies HTTP-only de acceso, refresh, CSRF y nonce de alta. Las nuevas mutaciones verifican un Origin exacto igual a APP_PUBLIC_ORIGIN, rechazan contexto cross-site y exigen coincidencia del token CSRF enviado con el almacenado en cookie.

En un registro se guarda el hash del nonce del navegador en el desafío. La confirmación desde ese navegador puede utilizar la contraseña original. Desde otro navegador Auth devuelve PASSWORD_CONFIRMATION_REQUIRED hasta que el destinatario establece una contraseña nueva. Esto impide que una prealta ajena mantenga una contraseña elegida por otra persona.

Los enlaces llevan el token en el fragmento #token=…, sin token en el query. Abrir un enlace por GET no consume el desafío ni inicia sesión. La interfaz añadida en la fase 6 lee el fragmento, lo retira de la barra y confirma por POST. Las páginas /register, /verify-email, /accept-invitation y /users pertenecen a esa entrega posterior; el runner de las fases 1–5 verifica los contratos sin requerir esas páginas.

Los destinos de retorno se limitan a rutas locales permitidas por el rol. Se rechazan destinos externos, rutas administrativas de un cliente, barras dobles, barras invertidas y valores malformados. La confirmación devuelve el destino; no inicia sesión automáticamente. Los adaptadores de alta no modifican el contenido del carrito.

El servidor propio scripts/secured-web-server.mjs, utilizado por npm run dev y npm start, toma la IP de la conexión y elimina los encabezados que un navegador intente falsificar. Solo acepta IP remitida por proxies incluidos en BFF_TRUSTED_PROXY_CIDRS, y firma la IP con TRUSTED_BFF_IP_KEY. El plugin onboarding-client-ip de Kong verifica la firma antes de aplicar límites; una firma inválida utiliza la IP observada por Kong y se vuelve a firmar para Auth.

## Desactivación y ventana de revocación

Una modificación de estado exige la versión actual de la identidad. Si otro administrador ya la cambió, Auth devuelve AUTH_VERSION_CONFLICT con estado 409.

Al desactivar, Auth aumenta auth_version, revoca todas las familias de refresh, invalida desafíos pendientes y registra auditoría dentro de una transacción. Reactivar vuelve a incrementar la versión; no recupera sesiones ni invitaciones revocadas. Un empleado habilitado y READY debe iniciar sesión otra vez.

Los JWT nuevos incluyen uv. Los anteriores sin ese campo se interpretan con versión cero. Un valor de versión malformado se rechaza.

Catalog, Inventory, Pricing, Orders, Logistics, CRM, Analytics y Realtime consultan la API privada de estado. Comparan ID, rol, versión y habilitación efectiva. El cache positivo dura como máximo 30 segundos desde el **inicio** de la consulta, con timeout de 3 segundos y deduplicación de consultas concurrentes. Sin estado vigente y ante fallo de Auth, rechazan la operación.

Realtime también valida las conexiones existentes cada segundo, mediante comprobaciones secuenciales y limpieza al desconectar. El objetivo de aceptación es bloquear APIs y sockets dentro de **35 segundos** después de desactivar. Esta es una ventana de revocación, no revocación instantánea. La prueba conjunta midió **30.093 segundos para las siete APIs de negocio y 30.037 segundos para el socket abierto**. Los tiempos corresponden a esta ejecución del entorno aislado.

Las llamadas internas entre servicios mantienen credenciales independientes de los JWT humanos.

## Correo y recuperación

Los eventos son auth.email.verification.requested.v1, auth.employee.invitation.requested.v1 y auth.email.delivery.updated.v1. Auth guarda identidad, desafío y outbox en una transacción. RabbitMQ temporalmente caído deja trabajo persistido para reintento.

Notification usa las tablas independientes de services/notification-service/migrations/003_auth_onboarding.sql. Antes de enviar consulta el contrato privado de Auth. Un desafío consumido, sustituido, revocado, vencido o de una identidad deshabilitada no autoriza el envío.

Los estados de entrega son PENDING, PROCESSING, SENT, SIMULATED, FAILED y UNDELIVERABLE. Auth registra resultado y número de intento, evitando que eventos anteriores reemplacen un resultado posterior. Se elimina el contenido cifrado al terminar la entrega o invalidarse el desafío.

| Modo | Significado |
| --- | --- |
| log | Simulación; estado SIMULATED. No produce un correo SMTP ni verifica la cuenta. |
| smtp | SENT indica que SMTP aceptó el destinatario. No garantiza entrega final al buzón ni verifica la cuenta. |
| Mailpit | SMTP real de captura para el entorno aislado; permite inspeccionar propósito, destino, vigencia y enlace. |

Los reintentos son limitados y utilizan registros persistidos. El Message-ID es estable por desafío. Una interrupción después de la aceptación SMTP y antes de confirmar la base puede generar un reintento; el proveedor SMTP no ofrece una garantía universal de envío exactamente una vez.

Las campañas y entregas de cupones permanecen en sus contratos y tablas anteriores. El onboarding no crea campañas ficticias ni altera sus contadores.

## Variables de configuración

Las claves son independientes y no se derivan del secreto JWT. .env.example contiene nombres y valores que deben reemplazarse; no contiene credenciales utilizables.

| Variable | Uso / valor predeterminado |
| --- | --- |
| APP_PUBLIC_ORIGIN | Origen fijo de enlaces y CSRF. HTTPS público; HTTP localhost solo con Auth en desarrollo. Integración: http://localhost:3105. |
| ONBOARDING_EMAIL_KEY | Clave base64url de exactamente 32 bytes para cifrado Auth/Notification. |
| AUTH_STATUS_INTERNAL_SERVICE_KEY | Clave base64url de al menos 32 bytes para consulta mínima de estado. Auth y ocho servicios que validan personas. |
| AUTH_ONBOARDING_INTERNAL_SERVICE_KEY | Clave base64url de al menos 32 bytes para autorización de correo Auth/Notification. |
| TRUSTED_BFF_IP_KEY | Clave base64url de al menos 32 bytes para IP autenticada entre servidor web, Kong y Auth. |
| AUTH_SERVICE_URL | URL privada de Auth. Compose utiliza http://servicio-autenticacion:3001; integración expone solo loopback http://127.0.0.1:3301. |
| AUTH_EMAIL_VERIFICATION_TTL_SECONDS | 3600 segundos. |
| AUTH_EMPLOYEE_INVITATION_TTL_SECONDS | 86400 segundos. |
| AUTH_ONBOARDING_RESEND_COOLDOWN_SECONDS | 60 segundos entre envíos a un correo. |
| AUTH_ONBOARDING_RESEND_HOURLY_LIMIT | Tres reenvíos durante la última hora. |
| AUTH_ONBOARDING_IP_WINDOW_SECONDS | 900 segundos. |
| AUTH_ONBOARDING_IP_LIMIT | Diez solicitudes públicas por IP y ventana. |
| BFF_TRUSTED_PROXY_CIDRS | Vacío por defecto; solo redes de proxies administrados. |
| RABBITMQ_URL | Transporte de los outbox y resultados, configurado por Compose. |
| NOTIFICATION_DELIVERY_MODE | log o smtp. |
| SMTP_URL | Obligatorio para SMTP; integración utiliza smtp://smtp-capture:1025. |
| NOTIFICATION_FROM_EMAIL | Remitente válido obligatorio para SMTP. |
| NOTIFICATION_RETRY_INTERVAL_SECONDS / NOTIFICATION_RETRY_LIMIT | 10 segundos / tres intentos por defecto; integración utiliza intervalo de un segundo. |

Auth almacena los contadores en PostgreSQL para que sobrevivan reinicios y los actualiza atómicamente. Kong agrega un límite local de diez peticiones por minuto en cada ruta pública de onboarding. El límite local de Kong complementa los contadores persistentes de Auth.

## Preparación y reproducción

Usar Node.js 22 o superior, Docker Desktop y PowerShell desde C:/Users/Aldo/Documents/Proyectos/ApliacionWeb/web.

El setup conserva .env.integration existente y añade solo variables nuevas ausentes, sin imprimir claves:

~~~powershell
node scripts/setup-integration.mjs
docker compose -p departamental-five-phases --env-file .env.integration -f compose.yaml -f compose.integration.yaml config --quiet
~~~

Las migraciones se ejecutan con el entrypoint de cada servicio al arrancar. **No se necesitan borrar volúmenes ni reiniciar seeds de datos existentes.** Los respaldos y la comparación previa de identidades y refresh deben prepararse antes de recrear Auth y Notification. Los respaldos privados de este trabajo están fuera de Git, en ../.codex-backups/accounts-first-five/.

Para construir e iniciar el entorno aislado, limitar la construcción a una imagen por vez:

~~~powershell
$env:COMPOSE_PARALLEL_LIMIT = "1"
docker compose -p departamental-five-phases --env-file .env.integration -f compose.yaml -f compose.integration.yaml build
docker compose -p departamental-five-phases --env-file .env.integration -f compose.yaml -f compose.integration.yaml up -d
docker compose -p departamental-five-phases --env-file .env.integration -f compose.yaml -f compose.integration.yaml ps
~~~

El override publica únicamente en loopback: web 3105, Kong 8005, Mailpit 18025, Auth 3301, Auth PostgreSQL 55431 y Notification PostgreSQL 55440. Las conexiones privadas del runner comprueban etiquetas de Compose y puertos para rechazar el entorno de negocio.

Validación de un servicio, repitiéndola para Auth, Notification y los ocho servicios que validan personas:

~~~powershell
Push-Location services/auth-service
npm run typecheck
npm run lint
npm test
npm run build
Pop-Location
~~~

Validación web y sintaxis del runner:

~~~powershell
npm run lint
npm run typecheck
npm test
npm run build
node --check scripts/verify-accounts-first-five.mjs
~~~

La comparación de migración admite un baseline privado con usersSha256, usersCount, refreshSha256 y refreshCount; no escribe filas, hashes de contraseñas ni tokens al reporte. Después de comprobar que todos los servicios del entorno aislado están saludables:

~~~powershell
node scripts/verify-accounts-first-five.mjs --baseline ../.codex-backups/accounts-first-five/baseline.json
~~~

Para repetir solo las comprobaciones funcionales después de la primera ejecución, omitir el baseline anterior: los nuevos usuarios sintéticos cambian el total de cuentas de pruebas. Los contadores por IP son persistentes; si se repite inmediatamente, esperar la ventana del límite para las solicitudes BFF del mismo navegador/IP.

~~~powershell
node scripts/verify-accounts-first-five.mjs
~~~

El runner crea cuentas sintéticas con un identificador de ejecución, usa cookies y correo de captura, prueba APIs y sockets, interrumpe y restaura RabbitMQ/Notification/Auth del proyecto aislado y registra resultados sanitizados en docs/verification-accounts-first-five.json. No utiliza bases de negocio. Los casos de simulación y fallo SMTP usan el worker real con un proveedor controlado y datos aislados; los envíos exitosos se comprueban contra Mailpit.

Comprobaciones independientes de migración y firma de IP en Kong:

~~~powershell
node services/auth-service/test/check-onboarding-migration.mjs
node scripts/verify-onboarding-client-ip.mjs
~~~

Regresiones del módulo anterior, ejecutadas secuencialmente después del runner de cuentas:

~~~powershell
node scripts/verify-five-phases.mjs
node scripts/verify-final-phases.mjs
~~~

## Evidencia y pendientes

| Verificación | Estado actual |
| --- | --- |
| TypeScript, lint, pruebas y build de Catalog, Inventory, Pricing, Orders, Logistics, CRM, Analytics y Realtime | Pasaron; 136 pruebas, incluidas 76 nuevas de identidad y sockets. |
| Auth y Notification: TypeScript, lint, pruebas y build | Pasaron; 36 pruebas de Auth y 24 de Notification. |
| Web: lint, TypeScript, pruebas y build | Pasaron; 129 pruebas Vitest y 7 pruebas de IP. El build final de Docker también pasó y el servidor web está saludable. |
| Firma de IP en Kong | Pasaron 13 comprobaciones en Kong 3.9.3, con firmas inválidas, encabezados falsificados y compatibilidad con el HMAC de Node. |
| Migración y compatibilidad | Migración real en PostgreSQL con identidades y refresh existentes: pasó. La comparación del entorno aislado preservó las 15 identidades y los 36 registros de refresh anteriores a las pruebas; los logins, la rotación y los JWT anteriores sin versión siguieron funcionando. |
| Registro e invitación reales mediante BFF/Kong/Auth/Notification/Mailpit | Pasaron, incluidas confirmación con nonce, contraseña nueva desde otro navegador, aceptación concurrente, roles y reenvíos. |
| Medición real de desactivación de APIs y sockets dentro de 35 segundos | Pasó: APIs 30.093 s; socket 30.037 s. Reactivar exigió login nuevo y no recuperó los tokens anteriores. |
| Reinicios, caída de RabbitMQ, expiración, concurrencia y ausencia de secretos | Pasaron; trabajo recuperado, cero mensajes duplicados observados y ningún envío de desafíos vencidos o revocados. Los límites persistieron tras reiniciar Auth y el cifrado terminal se eliminó. |
| Regresiones de compras, inventario, campañas, cupones y logística | Pasaron 14 comprobaciones del runner de primeras fases y 13 del runner de fases finales del módulo anterior. |

El conjunto suma **332 pruebas locales**, **21 comprobaciones conjuntas de cuentas**, **27 regresiones** y **13 comprobaciones específicas de Kong**. Los reportes sanitizados son [verification-accounts-first-five.json](verification-accounts-first-five.json), [verification-five-phases.json](verification-five-phases.json) y [verification-final-phases.json](verification-final-phases.json). La ejecución conjunta de cuentas terminó el 9 de octubre de 2026 a las 06:35:47 UTC; todos sus casos figuran como aprobados. El entorno aislado quedó funcionando después de restaurar los servicios interrumpidos por las pruebas.

Los resultados y cantidades anteriores corresponden al punto de control de las fases 1–5. La entrega posterior agrega las pantallas, pruebas de navegador y concurrencia, guía y respaldo con ensayo de migración del entorno de negocio. Consulta [la guía actualizada](alta-cuentas-entrega-y-demostracion.md) y sus reportes. Los cambios de este módulo quedan disponibles en el workspace, sin commit ni publicación.
