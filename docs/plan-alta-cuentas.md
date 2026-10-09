# Plan de registro de clientes y alta de empleados

Fecha de preparación: 8 de octubre de 2026. Actualización: 9 de octubre de 2026. Estado: fases 1–8 implementadas y verificadas localmente. Los contratos del backend están en [implementacion-alta-cuentas-fases-1-5.md](implementacion-alta-cuentas-fases-1-5.md); las pantallas, evidencia y preparación de entrega en [alta-cuentas-entrega-y-demostracion.md](alta-cuentas-entrega-y-demostracion.md). CI quedó configurado y requiere publicar los cambios para su ejecución remota. Las bases de negocio se respaldaron y las migraciones se ensayaron en una copia, sin aplicarlas al entorno de negocio.

El cliente podrá crear su cuenta desde el login y verificar su correo. El administrador podrá invitar empleados desde un módulo de Usuarios; cada empleado elegirá su propia contraseña. Auth será propietario de identidades, permisos, invitaciones y verificación. Notification enviará los mensajes mediante RabbitMQ. Next.js accederá a las APIs a través de Kong.

Estas ocho fases corresponden al módulo de cuentas y son independientes de las ocho fases anteriores de cumplimiento de los Word.

## Punto de partida anterior a las fases 1–5

- Auth ya tiene usuarios con roles `ADMIN`, `EMPLOYEE` y `CUSTOMER`, correos únicos sin distinguir mayúsculas, bcrypt, JWT, refresh rotativo y consulta administrativa de usuarios.
- El login ya usa cookies HTTP-only y un BFF que llama a Kong.
- No existen registro público, invitaciones, verificación de correo ni API administrativa de creación y estado de empleados.
- Notification tiene outbox, deduplicación, reintentos y SMTP, pero sus contratos y tablas de entregas actuales están orientados a cupones.
- Auth valida el usuario actual en su base; varios servicios de negocio validan únicamente el JWT. Revocar refresh tokens no invalida inmediatamente los access tokens ya emitidos.
- Existe un entorno aislado con Mailpit. El envío a destinatarios reales requiere configurar SMTP y un origen público correcto para los enlaces.

## Flujos acordados

| Tipo de cuenta | Entrada | Datos iniciales | Activación |
| --- | --- | --- | --- |
| Cliente | Login → Crear cuenta | Nombre, correo y contraseña | Confirmación del correo y posterior login |
| Empleado | Administración → Usuarios → Invitar empleado | Nombre y correo, introducidos por ADMIN | Invitación válida y elección de contraseña por el empleado |

El rol es una decisión del servidor: el registro público crea `CUSTOMER` y la invitación administrativa crea `EMPLOYEE`. Ninguno de estos formularios permite crear `ADMIN`.

Los usuarios existentes conservarán ID, contraseña, rol e historial. Un correo existente no se convierte automáticamente a otro rol. Si un administrador invita un correo ya utilizado por un cliente, recibirá un conflicto explicado en el módulo administrativo.

## Decisiones del módulo

### Identidad y estados

- Incorporar `email_verified_at`, `onboarding_status`, `created_by` y `auth_version` a Auth. Los estados de alta serán `PENDING_EMAIL`, `PENDING_INVITATION` y `READY`; `is_active` seguirá indicando habilitación administrativa.
- Marcar las identidades preexistentes como `READY` y verificadas por migración de compatibilidad, sin presentarlo como una comprobación histórica por correo. Registrar este origen administrativo en la auditoría de migración.
- Permitir `password_hash` nulo solamente para una invitación pendiente. Login y refresh exigirán cuenta habilitada, estado `READY` y contraseña establecida. Nunca intentar verificar bcrypt sobre un valor nulo.
- Mantener los identificadores existentes y la unicidad del correo. Normalizar espacios y mayúsculas, sin eliminar puntos ni alias específicos de proveedores.
- Mantener auditoría de creación, invitación, reenvío, aceptación, activación y desactivación; registrar actor, usuario, fecha y correlation ID, sin contraseña ni token.

### Contraseñas y enlaces

- Para contraseñas nuevas, exigir al menos 15 caracteres, permitir frases y evitar reglas obligatorias de símbolos. Mantener bcrypt y su límite actual de 72 bytes UTF-8, con validación equivalente en servidor y formulario; no truncar contraseñas. La regla nueva no rechazará contraseñas antiguas al hacer login. El mínimo se basa en la [guía de autenticación de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).
- Usar tokens aleatorios de al menos 32 bytes, con propósito, usuario, generación, vencimiento, consumo y revocación. Guardar su hash en la tabla de desafíos y consumirlos atómicamente. Las recomendaciones de tokens de un uso y vigencia se adaptan de [OWASP sobre recuperación de cuentas](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
- Proponer verificación de correo con vigencia de una hora e invitación de empleado con vigencia de 24 horas, configurables en Auth.
- Un reenvío crea una generación nueva e invalida las anteriores. No modifica nombre, contraseña ni rol de una cuenta existente mediante una petición pública.
- Las páginas de enlace muestran información y solicitan confirmación por POST. Abrir un enlace con GET no consume el token, para evitar activaciones por escáneres de correo.
- Transportar el token en el fragmento del enlace; retirarlo de la barra después de leerlo y enviarlo en el cuerpo del POST al BFF. No incluirlo en registros, analítica, mensajes de error ni URLs de retorno.
- Generar enlaces desde `APP_PUBLIC_ORIGIN`, validado en servidor; HTTPS en despliegue público y localhost permitido en desarrollo. No derivar el origen del encabezado Host de una petición.

### Correo y recuperación de fallos

- Auth persistirá el cambio de alta, el desafío y un outbox en una misma transacción. Un fallo temporal de RabbitMQ no perderá la invitación ni duplicará al usuario.
- Notification tendrá contratos y entregas de onboarding separados de las entregas de cupones. Los eventos propuestos son `auth.email.verification.requested.v1`, `auth.employee.invitation.requested.v1` y `auth.email.delivery.updated.v1`.
- El contenido sensible que permite reconstruir el enlace viajará cifrado en el outbox y en RabbitMQ con una clave dedicada a Auth y Notification. La tabla de desafíos conservará solo hashes. Borrar el contenido cifrado después de la entrega o el vencimiento según su retención; la auditoría no conserva el enlace.
- Notification comprobará por API privada de Auth que el desafío continúa vigente y no fue sustituido o revocado antes de enviar. El contacto y la autorización tendrán un propósito específico, sin abrir una consulta pública de usuarios.
- Reutilizar transporte SMTP y el mecanismo de reintentos, manteniendo los contratos existentes de cupones. Los mensajes de onboarding no usarán campañas ficticias ni se contabilizarán en CRM.
- Distinguir `PENDING`, `SENT`, `SIMULATED`, `FAILED` y `UNDELIVERABLE`. `SENT` indica aceptación SMTP; la cuenta solo queda verificada cuando se consume el desafío válido.

### Permisos y desactivación

- Solo ADMIN puede listar empleados, invitar, reenviar invitaciones y cambiar su habilitación. Las comprobaciones se aplican en Auth y en cada petición, siguiendo la [guía de autorización de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
- Al desactivar un empleado, invalidar invitaciones pendientes, aumentar `auth_version` y revocar todas sus familias de refresh tokens en una misma transacción. Reactivar no recupera invitaciones revocadas ni sesiones antiguas.
- Añadir una API privada de estado de identidad en Auth. Los servicios que aceptan JWT de personas comprobarán estado, rol y versión por API, sin consultar su base. Cachear resultados positivos como máximo 30 segundos; ante falta de respuesta y sin dato vigente, rechazar la operación.
- Incluir la versión de identidad en los JWT nuevos. Durante la migración, los JWT antiguos se interpretan con versión cero; una identidad desactivada o reactivada aumenta su versión y sus tokens anteriores dejan de ser aceptables.
- Realtime comprobará también el estado de conexiones existentes periódicamente y al reconectar. Objetivo de aceptación: nuevas peticiones y conexiones previamente abiertas quedan bloqueadas en un máximo de 35 segundos después de la desactivación, incluyendo el timeout de consulta. Documentar esta ventana; no llamarla revocación instantánea.
- Las llamadas internas de servicio a servicio conservan credenciales por propósito y no dependen de una cuenta de usuario.

## Contratos previstos

Todos los contratos públicos pasan por Kong. Las mutaciones del BFF usan validación de origen y protección CSRF cuando se autentican con cookies.

| Contrato en Auth | Acceso | Comportamiento |
| --- | --- | --- |
| `POST /auth/register` | Público con límites | Crea alta pendiente con rol CUSTOMER; respuesta genérica 202 |
| `POST /auth/email-verification/resend` | Público con límites | Reenvía si procede; misma respuesta genérica para correos existentes o inexistentes |
| `POST /auth/email-verification/confirm` | Token de propósito correcto y confirmación de la solicitud | Confirma el correo y habilita el alta; no inicia sesión automáticamente |
| `GET /auth/employees` | ADMIN | Lista paginada y búsqueda por nombre o correo, con estado de alta, habilitación y entrega |
| `POST /auth/employees/invitations` | ADMIN e Idempotency-Key | Invita como EMPLOYEE; devuelve 202 y un resultado estable ante reintentos |
| `POST /auth/employees/:id/invitation/resend` | ADMIN | Renueva invitación solo para empleado pendiente y habilitado |
| `POST /auth/employee-invitations/accept` | Token de invitación | Establece contraseña, consume token y completa el alta |
| `PATCH /auth/employees/:id/status` | ADMIN | Activa o desactiva solamente empleados, con control de versión para cambios simultáneos |
| `GET /internal/auth/users/:id/status` | Credencial interna por propósito | Devuelve habilitación, rol y versión mínimos; no se publica en Kong |
| `POST /internal/auth/onboarding-deliveries/authorize` | Notification autenticado | Comprueba propósito, generación y vigencia y entrega el contacto mínimo autorizado |

Las DTO rechazan campos ajenos al contrato, incluidos `role`, `isActive`, `emailVerifiedAt` y `authVersion` cuando el solicitante no puede decidirlos. Un token de verificación de cliente no sirve como invitación de empleado.

Para evitar activaciones de registros no iniciados por el destinatario, la verificación de cliente queda vinculada a la solicitud del navegador mediante un nonce HTTP-only. En otro navegador se exige confirmar o establecer nuevamente la contraseña antes de completar el alta. La posesión de un enlace no inicia sesión por sí sola.

Aplicar límites tanto en Kong por IP como en Auth por correo o identidad; las llamadas del BFF no deben atribuirse todas al mismo IP del contenedor. Punto de partida configurable: 10 intentos por IP cada 15 minutos, 60 segundos entre envíos a un correo y tres reenvíos por hora. Los contadores deben sobrevivir reinicios y ser atómicos. Separar estos límites del login actual y no bloquear una cuenta habilitada por intentos públicos de registro.

## Fases de implementación

| Fase | Entrega | Depende de |
| --- | --- | --- |
| 1 | Modelo de alta, desafíos, auditoría y compatibilidad | Base |
| 2 | Correos de onboarding y outbox de Auth | 1 |
| 3 | Registro y verificación de clientes en Auth | 1 y 2 |
| 4 | Invitaciones y administración de empleados en Auth | 1 y 2 |
| 5 | Kong, BFF y validación de cuentas en servicios | 3 y 4 |
| 6 | Pantallas y navegación completas | 5 |
| 7 | Pruebas de integración, seguridad y regresión | 6 |
| 8 | Documentación y preparación de entrega | 7 |

### Fase 1 Modelo y migraciones

- [x] Crear migraciones de Auth para estados de alta, verificación, versión y contraseña opcional para invitaciones.
- [x] Crear tablas de desafíos, límites de envío, auditoría, outbox y resultados recibidos.
- [x] Añadir repositorios y validaciones; documentar índices, bloqueos y estados válidos.
- [x] Probar la migración sobre una copia con usuarios, sesiones y compras existentes.

Aceptación: las cuentas previas siguen iniciando sesión, conservan ID y rol, y los estados pendientes no pueden iniciar sesión. No se reinician seeds ni datos de negocio.

### Fase 2 Correo y eventos

- [x] Incorporar publisher de Auth con RabbitMQ y outbox recuperable; añadir su red y configuración Compose.
- [x] Añadir consumidor, tablas y plantillas de verificación e invitación en Notification.
- [x] Implementar cifrado de contenido sensible, autorización privada previa al envío, deduplicación y resultados separados de CRM.
- [x] Registrar en Auth estados de entrega con número de intento y manejo de eventos atrasados.
- [x] Configurar Mailpit y el origen 3105 en pruebas, y variables documentadas para el entorno público.

Aceptación: Mailpit captura un enlace válido de cada propósito; RabbitMQ caído y reinicios no pierden el trabajo. Un desafío vencido o revocado no se envía. SIMULATED no activa ni verifica cuentas. Las campañas de cupones siguen funcionando.

### Fase 3 Clientes

- [x] Implementar registro, reenvío y confirmación con rol CUSTOMER fijo.
- [x] Gestionar correo duplicado, solicitud pendiente, envío fallido y correo vencido sin revelar cuentas mediante respuestas públicas.
- [x] Consumir el desafío y actualizar la identidad en una transacción; aplicar vínculo de solicitud para evitar prealtas ajenas.
- [x] Adaptar login y refresh al estado de alta y la verificación, conservando la compatibilidad de usuarios existentes.

Aceptación: el cliente se registra, confirma el correo y luego inicia sesión. Cambiar la petición para asignar EMPLOYEE o ADMIN falla. Dos confirmaciones simultáneas no producen dos activaciones ni dos sesiones.

### Fase 4 Empleados

- [x] Implementar listado paginado, invitación, reenvío y aceptación.
- [x] Implementar habilitación con control de versión, revocación transaccional y auditoría administrativa.
- [x] Evitar creación duplicada y conversión automática de clientes o administradores.
- [x] Asegurar que el administrador no conoce ni elige la contraseña definitiva del empleado.

Aceptación: solo ADMIN puede invitar y administrar; EMPLOYEE y CUSTOMER reciben 403. El empleado acepta un único enlace, elige contraseña y entra a sus áreas operativas. Un enlace revocado no se recupera al reactivar.

### Fase 5 Gateway BFF y sesiones

- [x] Publicar en Kong únicamente las rutas previstas, diferenciando públicas y protegidas y conservando rate limits y CORS.
- [x] Crear adaptadores del BFF, validación de origen y CSRF, y normalización de errores por correlation ID.
- [x] Entregar JWT con versión y añadir el cliente privado de estado de Auth a los guards de los servicios que reciben sesiones humanas y a Realtime.
- [x] Preservar cookies HTTP-only y validar destinos locales de retorno, incluyendo permisos del rol sobre el destino.
- [x] Mantener el carrito durante el registro; conservar `next` de forma segura durante verificación y login. La interfaz incorpora una bolsa anónima que se fusiona una sola vez al iniciar sesión como cliente; la prueba de navegador confirmó el retorno a checkout y la compra.

Aceptación: una petición directa al Gateway está protegida igual que la interfaz. Una cuenta desactivada no renueva sesión y sus peticiones y sockets quedan bloqueados dentro de 35 segundos. Rehabilitarla exige un login nuevo. Un `next` externo o administrativo para un cliente no redirige allí.

### Fase 6 Interfaz

- [x] Añadir Crear cuenta en `/login` y página `/register` con validación, confirmación de contraseña y estados de envío.
- [x] Crear `/verify-email` con confirmación explícita, vencimiento, reenvío y retorno seguro al login.
- [x] Crear `/accept-invitation` para establecer contraseña y aceptar la invitación.
- [x] Añadir `/users` solo para ADMIN: lista de empleados, búsqueda, estado de alta, habilitación, estado del correo, invitar y reenviar.
- [x] Añadir confirmación clara para desactivar y mensajes específicos para duplicados o conflictos de versión.
- [x] Verificar uso móvil, navegación por teclado y estados vacíos, de carga, error y operación pendiente. Durante implementación, leer las guías de Next.js incluidas en `node_modules/next/dist/docs/` según AGENTS.md.

Aceptación: ambos flujos se completan desde el navegador. No hay selector público de rol ni acceso al módulo de Usuarios para empleados o clientes. Un fallo de red permite reintentar sin crear otra cuenta o invitación.

### Fase 7 Verificación completa

- [x] Pruebas unitarias de DTO, contraseñas, estados, token, propósito, generación y límites.
- [x] Integración real con PostgreSQL, RabbitMQ, Kong y Mailpit; fixtures exclusivamente aislados.
- [x] Pruebas de concurrencia para correos duplicados, confirmación doble, aceptación doble, reenvío frente a aceptación y desactivación frente a refresh.
- [x] Comprobar manipulación de rol, tokens inválidos o vencidos, acceso a empleados de otro tipo de cuenta y protección CSRF.
- [x] Probar renovación y revocación de sesiones contra Auth, Orders, Inventory y conexiones Realtime; revisar todos los servicios con JWT humano.
- [x] Ejecutar login, compras, CRM, campañas, cupón y seguimiento como regresión del módulo anterior.
- [x] Ejecutar lint, TypeScript, pruebas y build de los componentes afectados, y configurar su CI. Añadir cobertura de navegador de los dos flujos. La ejecución remota queda vinculada a la publicación que se solicite en la fase 8.

Aceptación: cada fila de la matriz siguiente tiene resultado reproducible, y las credenciales, tokens de enlace y enlaces completos no aparecen en logs ni reportes.

| Caso | Resultado esperado |
| --- | --- |
| Cliente nuevo sin correo confirmado | Registro pendiente, sin sesión autorizada |
| Cliente confirma desde solicitud válida | READY; puede iniciar sesión y comprar |
| Petición pública con rol ADMIN o EMPLOYEE | Rechazo sin cambio de privilegios |
| Correo duplicado con distinta contraseña | Sin sobrescribir credenciales ni crear otra identidad |
| Token vencido, reutilizado o de otro propósito | Rechazo sin cambio de estado |
| Reenvío | Nueva generación; enlace anterior inválido |
| Invitación por ADMIN y aceptación | EMPLOYEE READY con contraseña elegida por él |
| Invitación por EMPLOYEE o CUSTOMER | 403 |
| Reintento de invitación con misma clave | Misma operación, una identidad y un desafío vigente |
| Desactivar empleado con sesión abierta | Refresh revocado y APIs y sockets bloqueados dentro de 35 segundos |
| Reactivar empleado | Puede iniciar sesión de nuevo; JWT y enlaces antiguos siguen revocados |
| RabbitMQ o SMTP interrumpido | Trabajo recuperable, sin verificar por mero envío |
| Registro iniciado en checkout | Carrito conservado y retorno local después del login |
| Cuentas existentes y campañas de cupones | Operación e historial conservados |

### Fase 8 Documentación y entrega

- [x] Documentar API, permisos, estados, variables, límites y comportamiento de revocación.
- [x] Preparar guía de demostración: cliente desde login y empleado desde admin, con mensajes de Mailpit y capturas.
- [x] Actualizar `.env.example`, Compose, scripts de preparación y CI, evitando incluir secretos.
- [x] Respaldar Auth y Notification antes de aplicar migraciones al entorno de negocio; comprobar IDs y cantidades de usuarios después.
- [x] Registrar los límites del entorno log y los requisitos de SMTP y HTTPS para el despliegue público.
- [x] Preparar cambios revisables y un resumen de validación. Commit, push, PR, merge o despliegue se realizarán cuando se soliciten para este módulo.

Aceptación final: se puede crear y verificar un cliente desde el login, invitar y habilitar un empleado desde ADMIN, impedir escalamiento de roles y desactivar su acceso con el límite documentado. Las migraciones y regresiones tienen evidencia; el alta no depende del script manual.

## Archivos y componentes principales

| Área | Componentes |
| --- | --- |
| Identidades | `services/auth-service/src/auth`, `src/users`, `src/refresh-tokens`, migraciones, nuevo módulo de onboarding y outbox |
| Correo | `services/notification-service/src/notifications`, nuevo módulo de onboarding y migraciones |
| Gateway e infraestructura | `infra/kong/kong.yml.template`, `compose.yaml`, `compose.integration.yaml`, `.env.example` |
| Sesiones de otros dominios | Guards JWT y configuración de los servicios de negocio; autenticación y conexiones de Realtime |
| Web | `src/app/login`, nuevas páginas de registro y enlaces, módulo `/users`, BFF, navegación y utilidades de sesión |
| Validación | Tests de Auth y Notification, contratos de autorización, scripts de integración, evidencia de navegador y CI |
