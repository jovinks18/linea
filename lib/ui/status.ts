import type { StatusPillVariant } from "../../components/StatusPill";

export function priorityVariant(priority: string | null | undefined): StatusPillVariant {
  if (priority === "P1" || priority === "P0") return "danger";
  if (priority === "P2") return "warning";

  return "muted";
}

export function healthVariant(status: string | null | undefined): StatusPillVariant {
  if (status === "at_risk") return "danger";
  if (status === "healthy") return "success";
  if (status === "watch") return "warning";

  return "muted";
}

export function sentimentVariant(
  sentiment: string | null | undefined
): StatusPillVariant {
  if (sentiment === "negative") return "warning";
  if (sentiment === "positive") return "success";

  return "muted";
}

export function severityVariant(severity: string | null | undefined): StatusPillVariant {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warning";

  return "muted";
}

export function reviewVariant(required: boolean): StatusPillVariant {
  return required ? "danger" : "success";
}
