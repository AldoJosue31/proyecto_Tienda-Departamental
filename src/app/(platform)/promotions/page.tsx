import { PromotionsWorkspace } from "@/components/promotions-workspace";
import { requireRole } from "@/lib/auth/session.server";
import { getPromotions } from "@/lib/pricing/promotions.server";

export default async function PromotionsPage() {
  await requireRole(["ADMIN"], "/promotions");
  const initial = await getPromotions().catch(() => null);
  return <PromotionsWorkspace initial={initial} />;
}
