export function formatUtcDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "Invalid date";

  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
