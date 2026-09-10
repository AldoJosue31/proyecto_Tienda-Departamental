import { CustomerOrders } from "@/components/customer-orders";
import { requireRole } from "@/lib/auth/session.server";
import { getCustomerShipmentsFor } from "@/lib/logistics/customer-shipments.server";
import { getCustomerOrders } from "@/lib/orders/customer-orders.server";

export default async function CustomerOrdersPage() {
  const user = await requireRole(["CUSTOMER"], "/orders");
  let initialOrders = null;
  let initialError: string | null = null;
  let initialShipments = null;
  let initialShipmentsError: string | null = null;
  const [ordersResult, shipmentsResult] = await Promise.allSettled([
    getCustomerOrders(),
    getCustomerShipmentsFor(user.id),
  ]);
  if (ordersResult.status === "fulfilled") {
    initialOrders = ordersResult.value;
  } else {
    initialError = "No fue posible cargar tus pedidos. Intenta actualizar la vista.";
  }
  if (shipmentsResult.status === "fulfilled") {
    initialShipments = shipmentsResult.value;
  } else {
    initialShipmentsError = "No fue posible consultar el avance de tus entregas.";
  }
  return <CustomerOrders
    initialOrders={initialOrders}
    initialError={initialError}
    initialShipments={initialShipments}
    initialShipmentsError={initialShipmentsError}
  />;
}
