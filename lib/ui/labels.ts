const acronymLabels: Record<string, string> = {
  api: "API",
  arr: "ARR",
  csm: "CSM",
  id: "ID",
  kpi: "KPI",
};

export function formatDisplayLabel(value: string | null | undefined) {
  if (!value) return "Not set";

  return value
    .split("_")
    .map(
      (part) =>
        acronymLabels[part.toLowerCase()] ??
        part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join(" ");
}
