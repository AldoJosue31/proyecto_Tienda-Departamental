# Gateway de la plataforma

Kong es la única entrada HTTP pública para los microservicios. Enruta Auth y
Catalog, aplica CORS explícito y propaga `X-Correlation-Id`. Login, refresh y
logout tienen rate limiting por IP. `GET /auth/me`, `GET /auth/users` y las
mutaciones de catálogo usan el plugin JWT; `POST /auth/refresh` y
`POST /auth/logout` no lo usan para permitir renovar o revocar una sesión con
un refresh token aunque el access token ya haya vencido.

Catalog se expone como `GET /products` y `GET /products/:id` públicos. Sus
cuatro mutaciones (`POST/PATCH /products`, `POST /products/:id/variants` y
`PATCH /variants/:id`) requieren JWT en el Gateway y el rol `ADMIN` se valida
de nuevo dentro de Catalog Service.

La configuración es DB-less y se renderiza sólo dentro del contenedor. Para
arrancar el conjunto local, define en `.env` una clave base64url de al
menos 32 caracteres y un origen web explícito:

```text
JWT_ACCESS_SECRET=replace-with-a-long-base64url-development-secret
CORS_ALLOWED_ORIGIN=http://localhost:3000
```

En producción, el valor se inyecta mediante el gestor de secretos del entorno
de despliegue; no se incluye en imágenes ni en este repositorio.


Las rutas de alta de cuentas son exactas: register, email-verification/resend,
email-verification/confirm y employee-invitations/accept son públicas con límites.
Las cuatro rutas de administración de empleados requieren JWT y Auth vuelve a
comprobar el rol ADMIN, habilitación y versión. Ninguna ruta /internal se publica.

El plugin local onboarding-client-ip verifica la firma de IP generada por el
servidor web, reemplaza cualquier header de cuota aportado por el cliente y se
 ejecuta antes de rate-limiting. Para llamadas directas usa la IP que obtiene
Kong y firma esa IP para Auth. Así las llamadas BFF no comparten una cuota del
contenedor ni un visitante puede elegir su IP modificando headers. La clave
TRUSTED_BFF_IP_KEY se inyecta en runtime. El algoritmo coincide con los clientes
Node; se usa la [API HMAC de Kong 3.9](https://github.com/Kong/kong/blob/3.9.1/kong/plugins/hmac-auth/access.lua)
y la [identificación por header del rate limiter](https://github.com/Kong/kong/blob/3.9.1/kong/plugins/rate-limiting/handler.lua).
