# Especificación del proyecto

La referencia vigente es [Proyecto Universitario Tienda Departamental v2.3](./Proyecto_Universitario_Tienda_Departamental_v2.3.docx), revisada el 10 de septiembre de 2026. Sustituye a la versión 2.2 para las aclaraciones indicadas en sus comentarios y sección 18. El original recibido se conserva sin cambios en Downloads.

La revisión mantiene tecnologías, microservicios, bases independientes, roles y las doce fases del roadmap arquitectónico. Aclara sucursal de atención frente a modalidad de entrega, confirmación comercial frente a pago, estados logísticos, permisos y endpoints ya existentes.

La versión 2.3 registró cuatro pendientes de código, ya cerrados mediante
implementación y pruebas. Logistics valida `channel`, conserva el snapshot de
los nuevos envíos y sólo proyecta `ONLINE`; una venta `PHYSICAL` se deduplica
sin crear preparación ni entrega. Orders sólo publica la compensación cuando
Logistics acepta la cancelación antes de `SHIPPED`; después responde `409` y no
promete un reembolso. La interfaz llama a la sucursal “que atiende el pedido”,
sin prometer retiro; Catálogo evita reutilizar resultados entre filtros, usa el
BFF de Next.js, conserva el encuadre de imágenes en la bolsa y muestra fechas
de CUSTOMER con una zona horaria explícita.

El nuevo ciclo de mejora CUSTOMER tiene **cinco fases** y está separado del roadmap arquitectónico: navegación y claridad; catálogo y variantes; bolsa y checkout; pedidos y cuenta; movimiento, accesibilidad y QA. Esta actualización documental no ejecuta esas fases.

El [contrato de venta física](./physical-sales-contract.md) complementa la especificación. Ante una discrepancia con el código, distinguir requisito, capacidad implementada y defecto pendiente antes de modificar cualquiera de ellos.
