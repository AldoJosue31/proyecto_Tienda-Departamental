# Acceso local de demostración

Las cuentas semilla se usan en desarrollo y en la demostración local. Para crear la configuración y arrancar la app, sigue la [instalación del README](README.md#instalación-local-con-docker-compose).

## Aplicación

- Web: [http://localhost:3000/login](http://localhost:3000/login), o el puerto `WEB_HOST_PORT` de `.env`.
- Gateway: [http://localhost:8000/health](http://localhost:8000/health).
- Mailpit: [http://localhost:18000](http://localhost:18000), al usar `compose.university.yaml`.

## Cuentas por rol

```bash
npm run credentials:local
```

Este comando lee `.env` y muestra únicamente los correos y contraseñas semilla de este equipo. No requiere instalar dependencias.

| Rol | Correo | Variable de contraseña |
| --- | --- | --- |
| ADMIN | `admin@departamental.local` | `SEED_ADMIN_PASSWORD` |
| EMPLOYEE | `employee@departamental.local` | `SEED_EMPLOYEE_PASSWORD` |
| CUSTOMER | `customer@departamental.local` | `SEED_CUSTOMER_PASSWORD` |

No hay contraseñas predeterminadas compartidas. `npm run setup:local` genera valores aleatorios en una instalación nueva; también puedes configurar cada contraseña en `.env` con al menos 12 caracteres antes del primer arranque. No publiques `.env` ni reutilices estas cuentas en producción.

## Bases existentes

El seed requiere `AUTH_RUN_SEED=true` y `AUTH_NODE_ENV=development`. Crea las cuentas faltantes y marca sus correos como verificados, pero no reemplaza contraseñas de cuentas existentes. Por ello, las credenciales mostradas por el comando solo corresponden a PostgreSQL si el seed creó las cuentas con esos mismos valores.

Para el registro de un cliente nuevo o la invitación de un empleado, abre el correo capturado por Mailpit y sigue su enlace. Los contratos del servicio están en [Auth Service](services/auth-service/README.md).
