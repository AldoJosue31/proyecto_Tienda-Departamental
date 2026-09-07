import type { PriceRule, Product } from "@/lib/domain/types";

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function isDailyWindowActive(rule: PriceRule, now: Date) {
  if (!rule.dailyWindow) return true;

  const current = minutesInTimeZone(now, rule.dailyWindow.timeZone);
  const start = toMinutes(rule.dailyWindow.start);
  const end = toMinutes(rule.dailyWindow.end);

  return start <= end
    ? current >= start && current < end
    : current >= start || current < end;
}

export function isRuleActive(rule: PriceRule, now = new Date()) {
  if (rule.status !== "PUBLISHED") return false;
  if (rule.startsAt && new Date(rule.startsAt) > now) return false;
  if (rule.endsAt && new Date(rule.endsAt) <= now) return false;
  return isDailyWindowActive(rule, now);
}

function appliesTo(rule: PriceRule, product: Product) {
  return rule.targets.some((target) => {
    if (target.type === "product") return target.id === product.id;
    if (target.type === "variant") return target.id === product.variant.id;
    return target.id === product.category;
  });
}

export function calculatePrice(product: Product, rules: PriceRule[], now = new Date()) {
  const matchingRules = rules
    .filter((rule) => isRuleActive(rule, now) && appliesTo(rule, product))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.discountValue - a.discountValue;
    });

  const rule = matchingRules[0];
  if (!rule) {
    return {
      finalPrice: product.variant.listPrice,
      discountPercentage: 0,
      appliedRule: undefined,
    };
  }

  const rawDiscount =
    rule.discountType === "PERCENTAGE"
      ? product.variant.listPrice * (rule.discountValue / 100)
      : rule.discountValue;
  const finalPrice = Math.max(0, Number((product.variant.listPrice - rawDiscount).toFixed(2)));
  const discountPercentage = Math.round(
    ((product.variant.listPrice - finalPrice) / product.variant.listPrice) * 100,
  );

  return {
    finalPrice,
    discountPercentage,
    appliedRule: { id: rule.id, name: rule.name },
  };
}
