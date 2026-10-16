# Plataforma Departamental

Aplicación de tienda departamental con catálogo, compras online, caja de venta física, inventario por sucursal, promociones, pedidos, entregas, CRM y reportes administrativos. Incluye cuentas con roles **ADMIN**, **EMPLOYEE** y **CUSTOMER**.

La interfaz usa Next.js 16 y React 19. El backend tiene diez microservicios NestJS detrás de Kong, bases PostgreSQL independientes, Redis, RabbitMQ y actualizaciones por Socket.IO. Consulta los [contratos y la arquitectura](docs/arquitectura.md) para los detalles técnicos.

## Requisitos

- Git.
- Node.js **22.x** y npm para preparar la configuración local. Las imágenes Docker también usan Node 22.
- Docker Desktop iniciado, con Docker Compose v2; en Linux puede usarse Docker Engine con el plugin Compose.
- Conexión a internet para descargar dependencias e imágenes. Los mapas OpenStreetMap también necesitan conexión para cargar sus teselas.
- Puertos disponibles: **3000** (web), **8000** (API) y **18000** (bandeja de correo local).

## Instalación local con Docker Compose

### 1. Obtener el proyecto

```bash
git clone --branch develop --single-branch https://github.com/AldoJosue31/proyecto_Tienda-Departamental.git
cd proyecto_Tienda-Departamental
```

### 2. Crear la configuración privada

```bash
npm run setup:local
```

El comando crea `.env` a partir de [.env.example](.env.example), genera una contraseña independiente para cada base de datos y cuenta de demostración, y genera las llaves privadas que requieren los servicios. No necesita `npm install` ni modifica un `.env` existente.

Si ya tienes `.env`, conserva sus valores y compara las variables con `.env.example`; el asistente no completa ni cambia una instalación existente. Para configurar manualmente, copia el ejemplo, reemplaza todos los `replace_with_*` y completa las llaves privadas vacías con valores independientes. Las tres contraseñas `SEED_*_PASSWORD` deben tener al menos 12 caracteres.

`.env` es privado y está excluido de Git. Las claves de Google Maps son opcionales para el arranque.

### 3. Construir y arrancar

Ejecuta desde la raíz del repositorio:

```bash
docker compose -f compose.yaml -f compose.university.yaml config --quiet
docker compose -f compose.yaml -f compose.university.yaml up -d --build --wait --wait-timeout 300
docker compose -f compose.yaml -f compose.university.yaml ps
```

La primera construcción puede tardar varios minutos. Docker instala las dependencias, ejecuta las migraciones y crea las cuentas, productos e inventario de demostración. No necesitas instalar PostgreSQL, Redis o RabbitMQ en tu equipo.

| Servicio | Dirección |
| --- | --- |
| Aplicación e inicio de sesión | [http://localhost:3000/login](http://localhost:3000/login) |
| API Gateway / salud de Auth | [http://localhost:8000/health](http://localhost:8000/health) |
| Mailpit: correos de verificación, invitaciones y campañas | [http://localhost:18000](http://localhost:18000) |

`compose.university.yaml` añade Mailpit para capturar correos dentro del entorno local; los mensajes no se entregan a buzones externos. Se incluye en estos comandos para poder completar el registro y las invitaciones desde la interfaz.

## Credenciales y roles

Consulta las contraseñas generadas **en tu equipo**:

```bash
npm run credentials:local
```

| Rol | Correo | Contraseña en `.env` | Acceso principal |
| --- | --- | --- | --- |
| ADMIN | `admin@departamental.local` | `SEED_ADMIN_PASSWORD` | Dashboard, catálogo, inventario, promociones, empleados y CRM. |
| EMPLOYEE | `employee@departamental.local` | `SEED_EMPLOYEE_PASSWORD` | Caja, inventario operativo, preparación y reparto. |
| CUSTOMER | `customer@departamental.local` | `SEED_CUSTOMER_PASSWORD` | Catálogo, bolsa, compras y pedidos propios. |

No hay una contraseña universal publicada. El comando muestra únicamente las tres credenciales semilla de tu archivo local. Consulta [Acceso local](ACCESO_LOCAL.md) si ya existían cuentas en la base.

Los usuarios semilla se crean con `AUTH_RUN_SEED=true` y `AUTH_NODE_ENV=development`; ya vienen habilitados para esta instalación. El seed crea cuentas faltantes y **no cambia contraseñas existentes**. Cambiar `SEED_*_PASSWORD` después del primer arranque no cambia la contraseña guardada en PostgreSQL.

También puedes registrar un cliente desde el login y abrir su enlace de verificación en Mailpit. Un administrador invita empleados desde la pantalla de usuarios. Usa estas cuentas y los seeds solo en desarrollo local.

## Uso diario

Todos los comandos deben usar los mismos archivos Compose:

```bash
# Detener conservando contenedores y datos
docker compose -f compose.yaml -f compose.university.yaml stop

# Volver a iniciar con los datos existentes
docker compose -f compose.yaml -f compose.university.yaml up -d --wait --wait-timeout 300

# Consultar los últimos mensajes de los servicios
docker compose -f compose.yaml -f compose.university.yaml logs --tail=100

# Eliminar contenedores y redes conservando los volúmenes
docker compose -f compose.yaml -f compose.university.yaml down
```

Los datos se guardan en volúmenes Docker. **No añadas `-v` a `down` si quieres conservarlos.**

## Desarrollo de la interfaz

Primero levanta el backend con los comandos anteriores. Luego detén únicamente la web de Docker para liberar el puerto 3000 y ejecuta la UI en tu equipo:

```bash
docker compose -f compose.yaml -f compose.university.yaml stop aplicacion-web
npm ci
npm run dev
```

El servidor usa `GATEWAY_INTERNAL_URL=http://localhost:8000` desde `.env` para llegar al Gateway. Los servicios y sus bases continúan en Docker.

Para volver a la web de Docker, detén `npm run dev` con Ctrl+C y ejecuta:

```bash
docker compose -f compose.yaml -f compose.university.yaml up -d aplicacion-web
```

## Verificaciones de código

Después de `npm ci`:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Cada microservicio tiene sus propias dependencias y verificaciones. Por ejemplo:

```bash
npm ci --prefix services/auth-service
npm run typecheck --prefix services/auth-service
npm run lint --prefix services/auth-service
npm test --prefix services/auth-service
npm run build --prefix services/auth-service
```

La [configuración de GitHub Actions](.github/workflows/ci.yml) comprueba web, diez servicios e integración. Las pruebas de navegador y certificación usan un entorno aislado; no las ejecutes contra una base con información que quieras conservar. Consulta la [guía de entrega](docs/entrega-definitiva-fases-7-9.md).

## Problemas comunes

| Problema | Qué revisar |
| --- | --- |
| Docker no responde | Inicia Docker Desktop y comprueba `docker info`. |
| Compose pide una variable | Completa tu `.env` usando `.env.example`; `setup:local` conserva archivos existentes. |
| Puerto 3000 ocupado | Detén el otro servidor o cambia `WEB_HOST_PORT`, `APP_PUBLIC_ORIGIN` y `CORS_ALLOWED_ORIGIN` al mismo puerto en `.env`; vuelve a crear los contenedores con `up -d`. |
| Error de autenticación de PostgreSQL tras cambiar `.env` | Usa las contraseñas originales del volumen; editar el archivo no cambia usuarios de bases existentes. |
| Las credenciales semilla no funcionan | Comprueba `AUTH_RUN_SEED=true`, los logs de `servicio-autenticacion` y si esa cuenta ya existía con otra contraseña. |
| No llega el correo | Revisa Mailpit en el puerto 18000 y que hayas incluido `compose.university.yaml`. |
| Un servicio tarda o queda `unhealthy` | Consulta `ps` y `logs --tail=100 nombre-del-servicio`; corrige la causa y repite `up -d --wait --wait-timeout 300`. |

Las guías históricas pueden mencionar 3005, 3105 o imágenes locales congeladas. Una instalación nueva usa los archivos y puertos indicados aquí; los `compose.release*.yaml` requieren archivos de imágenes de una entrega anterior y no son necesarios para instalar desde el código.

## Archivos y documentación

- `src/` y `public/`: interfaz y recursos actuales.
- `services/`: microservicios, migraciones, seeds y pruebas de cada dominio.
- `infra/` y `compose*.yaml`: infraestructura local y configuraciones de integración/recuperación.
- `tests/`, `e2e/` y `scripts/`: pruebas activas y herramientas de desarrollo; las usa CI.
- [Documentación del proyecto](docs/README.md): especificación, entrega y evidencia conservada.
- [Arquitectura y contratos](docs/arquitectura.md): dominios, permisos y API.

Las versiones descartadas de documentos e imágenes pueden recuperarse desde el historial de Git. Los temporales de Office, cachés, dependencias, secretos y resultados locales de pruebas se excluyen mediante `.gitignore`.
