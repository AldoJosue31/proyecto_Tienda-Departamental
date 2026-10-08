function wallParts(date: Date, timezone: string): number[] {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return ["year", "month", "day", "hour", "minute", "second"].map((type) => Number(parts.find((part) => part.type === type)?.value));
}

function wallTimestamp(parts: number[]): number { return Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]); }

/** Rejects DST gaps and ambiguous times instead of silently selecting an instant. */
export function zonedDateTimeToUtc(local: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!match) throw new Error("Selecciona una fecha y hora válidas.");
  const parts = match.slice(1).map((value) => Number(value ?? 0));
  const wall = wallTimestamp(parts);
  if (new Date(wall).toISOString().slice(0, 19) !== `${local.slice(0, 16)}:${match[6] ?? "00"}`) throw new Error("La fecha u hora no es válida.");
  const offsets = new Set([-36, 0, 36].map((hours) => {
    const sample = new Date(wall + hours * 3600000);
    return wallTimestamp(wallParts(sample, timezone)) - sample.getTime();
  }));
  const candidates = [...offsets].map((offset) => new Date(wall - offset)).filter((date) => wallParts(date, timezone).every((value, index) => value === parts[index]));
  if (candidates.length === 0) throw new Error("Esa hora no existe en la zona seleccionada por el cambio de horario.");
  if (candidates.length > 1) throw new Error("Esa hora ocurre dos veces por el cambio de horario. Selecciona otra hora.");
  return candidates[0].toISOString();
}

export function utcToZonedDateTime(value: string, timezone: string): string {
  const parts = wallParts(new Date(value), timezone).map((number) => String(number).padStart(2, "0"));
  return `${parts[0]}-${parts[1]}-${parts[2]}T${parts[3]}:${parts[4]}`;
}
