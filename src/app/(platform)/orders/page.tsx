import { CustomerOrders } from "@/components/customer-orders";
import { requireRole } from "@/lib/auth/session.server";
import { getCustomerOrders } from "@/lib/orders/customer-orders.server";

export default async function CustomerOrdersPage() {
  await requireRole(["CUSTOMER"], "/orders");
  let initialOrders = null;
  let initialError: string | null = null;
  try {
    initialOrders = await getCustomerOrders();
  } catch {
    initialError = "No fue posible cargar tus pedidos. Intenta actualizar la vista.";
  }
  return <CustomerOrders initialOrders={initialOrders} initialError={initialError} />;
}
