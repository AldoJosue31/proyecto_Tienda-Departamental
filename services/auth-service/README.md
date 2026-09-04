# Auth Service

Microservicio NestJS dueño de la identidad de la plataforma. Persiste usuarios, roles y refresh tokens exclusivamente en **PostgreSQL Auth**; ningún otro servicio debe leer sus tablas directamente.

El access token es un JWT HS256 con `iss: departamental-auth-service`, `sub`, `role`, `exp` y `jti`. El Gateway puede validar el mismo token configurando una credencial JWT con `key=departamental-auth-service` y el secreto compartido por una vía segura. Los refresh tokens son opacos: solo se guarda su hash SHA-256, se rotan en cada renovación y la reutilización de uno rotado revoca toda su familia.

## Contrato HTTP

Todos los errores siguen este formato y nunca incluyen stack traces, hashes, contraseñas ni tokens:

```json
{
  "code": "UNAUTHORIZED",
  "message": "No autorizado",
  "correlationId": "..."
}
```

| Método y ruta | Autorización | Uso |
| --- | --- | --- |
| `GET /health` | Pública | Comprueba servicio y PostgreSQL. |
| `POST /auth/login` | Pública | Recibe `{ email, password }`. |
| `POST /auth/refresh` | Refresh opaco | Recibe `{ refreshToken }`; rota la sesión usando únicamente el refresh token válido, incluso si el access token expiró o no existe. |
| `POST /auth/logout` | Refresh opaco o Bearer | Con `{ refreshToken }` revoca únicamente esa sesión aunque no exista un access token válido. Sin refresh requiere Bearer y revoca todas las sesiones refresh del usuario autenticado. |
| `GET /auth/me` | Bearer | Devuelve el usuario actual y su rol. |
| `GET /auth/users` | `ADMIN` | Lista identidad y rol sin hashes ni contraseñas; permite verificar RBAC de backend durante esta fase. |

`POST /auth/login` y `POST /auth/refresh` responden:

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<opaque token>",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshExpiresIn": 2592000,
  "user": {
    "id": "uuid",
    "email": "admin@departamental.local",
    "name": "Administrador local",
    "role": "ADMIN"
  }
}
```

`GET /auth/me` devuelve `{ "user": { "id", "email", "name", "role" } }`.

`POST /auth/logout` con un refresh token que ya está vencido, revocado o no existe
responde `{ "success": true }` sin revelar si dicho token pertenecía a una sesión.
Un refresh ausente o malformado se controla con los errores estándar; para renovar,
un refresh desconocido, vencido, revocado o de una cuenta inactiva responde
`401 INVALID_REFRESH_TOKEN` y nunca entrega datos de usuario.

## Requisito del Gateway

El Gateway debe reenviar `POST /auth/refresh` y `POST /auth/logout` sin exigir el
plugin JWT; de lo contrario un access token vencido sería rechazado antes de llegar
a este servicio. Mantén rate limiting y CORS en esas rutas. `GET /auth/me` y
`GET /auth/users` sí permanecen protegidas con Bearer/JWT.

## Configuración local segura

1. Copia `.env.example` a `.env.local` (no se versiona).
2. Genera el secreto con el comando de `.env.example`; debe ser base64url y decodificar a al menos 32 bytes.
3. Crea una base PostgreSQL propia, por ejemplo `auth_service`, y define `DATABASE_URL` con una contraseña local no reutilizada.
4. Ejecuta las migraciones y, solo para desarrollo, los usuarios semilla:

```powershell
npm install
$env:DATABASE_URL = 'postgres://auth_service:contraseña-local@localhost:5433/auth_service'
$env:JWT_ACCESS_SECRET = node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
npm run db:migrate
npm run db:seed
npm run start:dev
```

El seed se bloquea cuando `NODE_ENV=production`. Para desarrollo local crea, si no existen, estos usuarios (cambia las contraseñas mediante `SEED_*_PASSWORD` antes de ejecutar el seed en cualquier entorno compartido):

| Rol | Correo | Contraseña local predeterminada |
| --- | --- | --- |
| `ADMIN` | `admin@departamental.local` | `AdminLocal!2026` |
| `EMPLOYEE` | `employee@departamental.local` | `EmployeeLocal!2026` |
| `CUSTOMER` | `customer@departamental.local` | `CustomerLocal!2026` |

Las contraseñas de seed no se imprimen ni se escriben como hashes en logs. No habilites `RUN_SEED` fuera del entorno local.

En producción `CORS_ORIGINS` es obligatorio y no admite `*`; el servicio ya rechaza wildcard también en desarrollo. El Dockerfile no copia secretos y `RUN_SEED` permanece desactivado por defecto.

## Calidad

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Ejecución en contenedor

El servicio escucha internamente en el puerto `3001`. Inyecta `DATABASE_URL`, `JWT_ACCESS_SECRET` y `CORS_ORIGINS` mediante Compose, secretos o el entorno de despliegue; no dentro de la imagen. Para desarrollo, el entrypoint ejecuta migraciones de forma idempotente. Los seeds solo se ejecutan cuando `RUN_SEED=true` y nunca en producción.
