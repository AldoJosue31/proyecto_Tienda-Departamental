# Especificación del proyecto

La referencia vigente es [Proyecto Universitario Tienda Departamental v2.4](./Proyecto_Universitario_Tienda_Departamental_v2.4.docx), revisada el 6 de octubre de 2026 contra el código y la configuración del repositorio en `1c6a677`. La [versión 2.3](./Proyecto_Universitario_Tienda_Departamental_v2.3.docx) se conserva como antecedente.

La revisión mantiene microservicios, bases independientes, roles y las doce fases del roadmap arquitectónico. Actualiza tecnologías, diagramas, consumidores reales de eventos, Outbox, recursos heredados y límites de escalado. Las doce áreas tienen implementación en código; esto no certifica integración completa, rendimiento ni producción.

P01 y P02 están incorporados: la interfaz distingue sucursal de atención y modalidad de entrega; Logistics valida `channel`, conserva el snapshot y sólo proyecta `ONLINE`. Una venta `PHYSICAL` se deduplica sin crear envío. P03 incorpora consulta privada a Logistics, rechazo de cancelación de un envío existente después del despacho y estado reintentable `CANCELLATION_PENDING`; aún debe validarse la carrera con una proyección tardía. P04 está parcialmente corregido: BFF, `initialData`, encuadre de imágenes y fechas explícitas ya están presentes, pero siguen pendientes el loader específico de otras rutas y la continuidad de categoría, marca y página al salir del catálogo.

El ciclo CUSTOMER tiene **cinco fases** separadas del roadmap arquitectónico. Ya incluye navegación por rol, selección de variantes, bolsa local por usuario, checkout idempotente, pedidos propios y seguimiento privado. Su cierre funcional y de accesibilidad sigue pendiente; la sección 18 del Word detalla el estado de cada fase. Pasaron 36 pruebas seleccionadas de frontend, Orders y Logistics, sin atribuirles cobertura E2E ni integración real con contenedores.

El [contrato de venta física](./physical-sales-contract.md) complementa la especificación. Ante una discrepancia con el código, distinguir requisito, capacidad implementada y defecto pendiente antes de modificar cualquiera de ellos.

El módulo de alta de cuentas tiene su propio [plan de ocho fases](./plan-alta-cuentas.md). La [guía de entrega y demostración](./alta-cuentas-entrega-y-demostracion.md) explica el registro de clientes desde login, las invitaciones de empleados desde ADMIN, Mailpit, pruebas y respaldo; sus reportes distinguen comprobación local, CI preparado y bases de negocio sin migrar.
