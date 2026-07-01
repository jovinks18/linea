const timezoneLessTimestamp =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

function parseOperatorDateTime(value: string | Date) {
  if (value instanceof Date) return value;

  const normalized = timezoneLessTimestamp.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;

  return new Date(normalized);
}

export function formatOperatorDateTime(
  value: string | Date | null | undefined
) {
  if (!value) return "Not set";

  const date = parseOperatorDateTime(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";

  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
