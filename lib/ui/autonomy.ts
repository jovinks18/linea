export type AutonomyMetadata = Record<string, unknown> | null | undefined;

export type AutonomyActionLike = {
  status: string;
  metadata: AutonomyMetadata;
};

export type AutonomyBadge = {
  kind: "tier" | "counterfactual" | "review";
  label: string;
};

export type AutonomyDetails = {
  tier: string | null;
  reason: string | null;
  segment: string | null;
  confidenceFloor: number | null;
  blastRadius: number | null;
  maxBlastRadius: number | null;
  reversible: boolean | null;
  requiresReversible: boolean | null;
  counterfactual: boolean;
  enqueueReview: boolean;
};

function readString(metadata: AutonomyMetadata, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value ? value : null;
}

function readNumber(metadata: AutonomyMetadata, key: string) {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(metadata: AutonomyMetadata, key: string) {
  const value = metadata?.[key];
  return typeof value === "boolean" ? value : null;
}

function formatValue(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSegment(value: string) {
  return value.replaceAll("_", " ");
}

export function formatAutonomyTier(value: unknown) {
  return typeof value === "string" && value ? formatValue(value) : null;
}

export function getAutonomyDetails(
  metadata: AutonomyMetadata
): AutonomyDetails {
  return {
    tier: readString(metadata, "tier"),
    reason: readString(metadata, "reason"),
    segment: readString(metadata, "segment"),
    confidenceFloor: readNumber(metadata, "confidence_floor"),
    blastRadius: readNumber(metadata, "blast_radius"),
    maxBlastRadius: readNumber(metadata, "max_blast_radius"),
    reversible: readBoolean(metadata, "reversible"),
    requiresReversible: readBoolean(metadata, "requires_reversible"),
    counterfactual: readBoolean(metadata, "counterfactual") === true,
    enqueueReview: readBoolean(metadata, "enqueue_review") === true,
  };
}

export function getAutonomySummary(action: AutonomyActionLike) {
  const details = getAutonomyDetails(action.metadata);

  if (details.counterfactual) {
    return "Counterfactual only; no database mutation was performed.";
  }

  if (action.status === "executed" && details.tier) {
    const segment = details.segment
      ? ` for ${formatSegment(details.segment)}`
      : "";
    return `Executed under ${details.tier} policy${segment}.`;
  }

  if (action.status === "suggested" && details.reason === "supervised") {
    return "Suggested because this action requires supervision.";
  }

  if (
    action.status === "suggested" &&
    (details.reason === "out_of_bounds" ||
      details.reason === "guard_failed")
  ) {
    return `Suggested because guard failed: ${details.reason}.`;
  }

  if (action.status === "skipped" && details.reason) {
    return `Skipped because ${details.reason.toLowerCase()}.`;
  }

  if (action.status === "failed" && details.reason) {
    return `Failed: ${details.reason}.`;
  }

  if (action.status === "suggested" && details.tier) {
    return `Suggested under ${details.tier} policy; no database mutation was performed.`;
  }

  return null;
}

export function getAutonomyBadges(
  metadata: AutonomyMetadata
): AutonomyBadge[] {
  const details = getAutonomyDetails(metadata);
  const badges: AutonomyBadge[] = [];
  const tier = formatAutonomyTier(details.tier);

  if (tier) {
    badges.push({ kind: "tier", label: `${tier} policy` });
  }
  if (details.counterfactual) {
    badges.push({ kind: "counterfactual", label: "Counterfactual" });
  }
  if (details.enqueueReview) {
    badges.push({ kind: "review", label: "Review queued" });
  }

  return badges;
}
