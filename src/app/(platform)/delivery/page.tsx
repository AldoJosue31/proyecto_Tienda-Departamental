import { requireRole } from "@/lib/auth/session.server";
import { CourierWorkspace } from "@/components/courier-workspace";
export default async function DeliveryPage() { await requireRole(["EMPLOYEE"],"/delivery");return <section className="platform-page"><CourierWorkspace /></section>; }
