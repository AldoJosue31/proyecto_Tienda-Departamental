const TIMEZONE = "America/Mexico_City";

function localParts(date: Date): number[] {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return ["year", "month", "day", "hour", "minute", "second"].map((type) => Number(parts.find((part) => part.type === type)?.value));
}
function timestamp(parts: number[]): number { return Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!, parts[3]!, parts[4]!, parts[5]!); }

export function inactiveCutoff(reference: Date, months: number): Date {
  const parts = localParts(reference);
  const first = new Date(Date.UTC(parts[0]!, parts[1]! - 1 - months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const target = [first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(parts[2]!, lastDay), parts[3]!, parts[4]!, parts[5]!];
  const wall = timestamp(target);
  const offsets = new Set([-36, 0, 36].map((hours) => {
    const sample = new Date(wall + hours * 3600000);
    return timestamp(localParts(sample)) - sample.getTime();
  }));
  const candidates = [...offsets].map((offset) => wall - offset).filter((instant) => localParts(new Date(instant)).every((value, index) => value === target[index]));
  if (!candidates.length) throw new Error("Invalid calendar cutoff");
  return new Date(Math.min(...candidates) + reference.getUTCMilliseconds());
}
