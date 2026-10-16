# Especificación del proyecto

Para instalar desde cero y consultar las cuentas de demostración, usa el [README principal](../README.md) y la [guía de acceso local](../ACCESO_LOCAL.md). Los documentos de cierre describen entregas históricas y pueden usar otros puertos.

La entrega universitaria final está aprobada el 14 de octubre de 2026. El [acta de fases 7–9](./entrega-definitiva-fases-7-9.md), la [guía de demostración](./guia-demostracion-requisitos.md) y el [plan de nueve fases cerrado](./plan-cierre-definitivo.md) enlazan la versión exacta, CI, respaldo, recuperación y pruebas del principal en localhost:3005. Los informes de [fases 1–3](./implementacion-cierre-fases-1-3.md) y [fases 4–6](./implementacion-cierre-fases-4-6.md) conservan la historia; su entorno aislado usa 3105.

La referencia vigente es [Proyecto Universitario Tienda Departamental v2.4](./Proyecto_Universitario_Tienda_Departamental_v2.4.docx), revisada el 6 de octubre de 2026 contra el código y la configuración del repositorio en `1c6a677`. La versión 2.3 anterior puede recuperarse desde el historial de Git. La [memoria final de entrega](./Proyecto_Universitario_Tienda_Departamental_Final.docx) se conserva como entregable universitario.

La revisión mantiene microservicios, bases independientes, roles y las doce fases del roadmap arquitectónico. Actualiza tecnologías, diagramas, consumidores reales de eventos, Outbox, recursos heredados y límites de escalado. Las doce áreas tienen implementación en código; esto no certifica integración completa, rendimiento ni producción.

Los cierres P01–P04 y el ciclo CUSTOMER se verificaron en la entrega final: modalidades física/online, cancelación frente a proyección tardía y despacho, filtros de categoría/marca/página, precios vigentes, bolsa por usuario, compra, pedidos propios y seguimiento. La [evidencia de fases 7–9](./verification-fases-7-9-summary.json) distingue pruebas locales, CI, versión desplegada y validación del principal. La especificación Word conserva el diagnóstico que tenía al redactarse; el acta final determina el estado operativo actual.

El [contrato de venta física](./physical-sales-contract.md) complementa la especificación. Ante una discrepancia con el código, distinguir requisito, capacidad implementada y defecto pendiente antes de modificar cualquiera de ellos.

El módulo de alta de cuentas tiene su propio [plan de ocho fases](./plan-alta-cuentas.md). La [guía de entrega y demostración](./alta-cuentas-entrega-y-demostracion.md) explica el registro de clientes desde login, las invitaciones de empleados desde ADMIN, Mailpit, pruebas y respaldo; sus reportes distinguen comprobación local, CI preparado y bases de negocio sin migrar.

## Conservación de archivos

Se mantienen la especificación vigente, la memoria final, las pruebas activas y los informes únicos que respaldan los cierres y la recuperación. Se retiraron temporales de Word, versiones descartadas del diseño de login, recursos de ejemplo sin uso y copias idénticas de reportes sin referencias. Las versiones anteriores siguen disponibles en Git. Los manifiestos de entregas son registros históricos inmutables: sus listas describen los archivos de aquella versión.
