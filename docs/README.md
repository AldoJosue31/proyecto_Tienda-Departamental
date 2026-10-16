# Documentación del proyecto

Para instalar la app desde el código, empieza por el [README principal](../README.md). Las cuentas y contraseñas locales se consultan siguiendo [Acceso local](../ACCESO_LOCAL.md).

## Guías y contratos

| Documento | Contenido |
| --- | --- |
| [Memoria final](Proyecto_Universitario_Tienda_Departamental_Final.docx) | Entregable universitario del sistema. |
| [Arquitectura](arquitectura.md) | Microservicios, dominios, permisos y comunicación. |
| [Cuentas](cuentas-contrato.md) | Registro, invitaciones, sesiones, seguridad y configuración. |
| [Demostración de cuentas](alta-cuentas-entrega-y-demostracion.md) | Registro de clientes, invitaciones de empleados y Mailpit. |
| [Ventas físicas](physical-sales-contract.md) | Contrato de caja e inventario compartido con ventas online. |
| [Demostración de requisitos](guia-demostracion-requisitos.md) | Recorridos, matriz de requisitos y capturas de la entrega. |
| [Recuperación coordinada](recuperacion.md) | Checkpoints, imágenes, bases, RabbitMQ y reversión. |

## Evidencia de la entrega

El [acta del 14 de octubre de 2026](entrega-definitiva-fases-7-9.md) y el [resumen verificable](verification-fases-7-9-summary.json) identifican la versión universitaria certificada, sus pruebas, CI y despliegue. Sus fechas, cantidades y puertos describen esa ejecución; no certifican automáticamente los commits posteriores.

- `verification-*.json` y `audit-runtime-*.json`: resultados y datos que utilizan las herramientas de verificación y recuperación.
- `ci-release-2ea6dbe/`: evidencia de GitHub Actions de la versión indicada en el acta; es independiente de la ejecución local.
- `release-fases-*.json` y los reportes de imágenes/archivo: manifiestos históricos necesarios para identificar imágenes y cadenas de respaldo. Se mantienen en sus rutas porque los scripts los consultan. Algunos duplicados son entradas distintas de esas herramientas.
- [Capturas de la entrega](guia-demostracion-requisitos.md#capturas-de-la-entrega): escritorio y móvil. Las capturas de registro e invitaciones están en la guía de cuentas.
- [Auditoría de compatibilidad con Supabase](auditoria-supabase-2026-10-11.md): evaluación opcional fechada; no forma parte de la instalación local.

Los planes terminados, informes de puntos de control anteriores, capturas sustituidas y versiones antiguas de Word se recuperan desde el historial de Git. Los manifiestos conservan nombres y hashes de archivos que existían al congelar cada versión; esas referencias históricas no son enlaces a la documentación actual.
