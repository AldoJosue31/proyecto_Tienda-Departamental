import { PickPackBoard } from "@/components/pick-pack-board";
import { requireRole } from "@/lib/auth/session.server";
import { getPickPackDashboard } from "@/lib/logistics/pick-pack.server";

export default async function OperationsPage() {
  await requireRole(["ADMIN", "EMPLOYEE"], "/operations");
  const initialDashboard = await getPickPackDashboard().catch(() => null);

  return (
    <section className="mx-auto max-w-[1120px] px-4 py-9 sm:px-6 lg:px-8 lg:py-12">
        <PickPackBoard initialDashboard={initialDashboard} maps={{ browserKey: process.env.GOOGLE_MAPS_BROWSER_KEY?.trim() || null, mapId: process.env.GOOGLE_MAPS_MAP_ID?.trim() || null }} />
    </section>
  );
}
