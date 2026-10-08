import { CustomerCheckout } from "@/components/customer-checkout";
import { requireRole } from "@/lib/auth/session.server";

export default async function CheckoutPage() {
  await requireRole(["CUSTOMER"], "/checkout");
  return <CustomerCheckout />;
}
