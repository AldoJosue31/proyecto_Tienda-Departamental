import { isRuleActive } from "@/lib/domain/pricing";
import { invalidateProductCaches } from "@/lib/server/catalog-service";
import { releaseExpiredReservations } from "@/lib/server/inventory-service";
import { priceRules } from "@/lib/server/seed-data";

export async function runScheduledMaintenance(now = new Date()) {
  const releasedReservations = releaseExpiredReservations(now.getTime());
  const activeRules = priceRules.filter((rule) => isRuleActive(rule, now)).map((rule) => rule.id);

  // A real worker also writes the outbox transition event here. Price evaluation
  // still checks `now`, which prevents a delayed job from skipping a discount.
  if (releasedReservations > 0 || activeRules.length > 0) await invalidateProductCaches();

  return {
    ranAt: now.toISOString(),
    releasedReservations,
    activeRules,
  };
}
