const customerTimeZone = "America/Mexico_City";

export function formatCustomerDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Fecha no disponible";

  const formatted = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: customerTimeZone,
  }).format(date);

  return `${formatted} (hora del Centro de México)`;
}
