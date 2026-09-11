import { notFound } from "next/navigation";

import { CustomerOrderDetail, CustomerOrderDetailUnavailable } from "@/components/customer-order-detail";
import { requireRole } from "@/lib/auth/session.server";
import { getCustomerShipmentsFor } from "@/lib/logistics/customer-shipments.server";
import { CustomerOrdersRequestError, getCustomerOrder } from "@/lib/orders/customer-orders.server";

type CustomerOrderDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CustomerOrderDetailPage({ params }: CustomerOrderDetailPageProps) {
  const { id } = await params;
  const user = await requireRole(["CUSTOMER"], `/orders/${encodeURIComponent(id)}`);
  const [orderResult, shipmentsResult] = await Promise.allSettled([
    getCustomerOrder(id),
    getCustomerShipmentsFor(user.id),
  ]);

  if (orderResult.status === "rejected") {
    if (orderResult.reason instanceof CustomerOrdersRequestError && [403, 404].includes(orderResult.reason.status)) {
      notFound();
    }
    return <CustomerOrderDetailUnavailable />;
  }

  const shipment = shipmentsResult.status === "fulfilled"
    ? shipmentsResult.value.find((candidate) => candidate.orderId === orderResult.value.id)
    : undefined;
  return <CustomerOrderDetail
    order={orderResult.value}
    shipment={shipment}
    shipmentError={shipmentsResult.status === "rejected"}
  />;
}
