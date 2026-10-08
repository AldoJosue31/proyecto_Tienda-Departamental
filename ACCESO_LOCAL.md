# Acceso local de demostración

Esta guía reúne las cuentas semilla para iniciar sesión en la aplicación durante el desarrollo o la presentación del proyecto. Son credenciales de prueba; no deben usarse en producción ni en un entorno compartido.

## Aplicación

- Web local: `http://localhost:3000` (o el puerto definido por `WEB_HOST_PORT` en `.env`).
- Gateway API: `http://localhost:8000`.
- El seed de Auth se habilita con `AUTH_RUN_SEED=true` en `.env`; en `.env.example` viene habilitado para desarrollo local.

## Cuentas por rol

| Rol | Correo | Contraseña semilla predeterminada |
| --- | --- | --- |
| `ADMIN` | `admin@departamental.local` | `AdminLocal!2026` |
| `EMPLOYEE` | `employee@departamental.local` | `EmployeeLocal!2026` |
| `CUSTOMER` | `customer@departamental.local` | `CustomerLocal!2026` |

## Importante sobre las contraseñas

Compose permite sustituir cada contraseña con `SEED_ADMIN_PASSWORD`, `SEED_EMPLOYEE_PASSWORD` y `SEED_CUSTOMER_PASSWORD` en `.env`. Si se definieron esos valores, usa los configurados allí en lugar de los predeterminados de esta tabla.

El seed crea las cuentas que todavía no existen. Si una cuenta ya estaba creada, volver a iniciar el seed no cambia su contraseña; por eso, en una base existente, la contraseña guardada puede diferir de la tabla. Para una base de datos local nueva, las cuentas se crean al iniciar Compose mientras `AUTH_RUN_SEED=true`.

Para iniciar el proyecto, consulta la sección “Arranque local con Docker Compose” de [README.md](./README.md). Los contratos y detalles del servicio de identidad están en [services/auth-service/README.md](./services/auth-service/README.md).
