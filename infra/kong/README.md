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
