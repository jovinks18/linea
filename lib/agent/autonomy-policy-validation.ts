import type {
  ActionAutonomyPolicy,
  AutonomyTier,
} from "./autonomy-policy";

export type PolicyUpdatePatch = Partial<
  Pick<
    ActionAutonomyPolicy,
    | "tier"
    | "confidence_floor"
    | "max_blast_radius"
    | "requires_reversible"
  >
>;

export type PolicyUpdateValidationResult =
  | {
      valid: true;
      value: {
        patch: PolicyUpdatePatch;
        changedBy: string;
        changeReason: string;
      };
    }
  | {
      valid: false;
      errors: string[];
    };

const allowedPatchFields = new Set([
  "tier",
  "confidence_floor",
  "max_blast_radius",
  "requires_reversible",
]);

const autonomyTiers: AutonomyTier[] = [
  "shadow",
  "supervised",
  "bounded",
  "autonomous",
];

function normalizeNumber(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    value === ""
  ) {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

export function validatePolicyUpdate({
  existingPolicy,
  patch,
  changedBy,
  changeReason,
}: {
  existingPolicy: ActionAutonomyPolicy;
  patch: Record<string, unknown>;
  changedBy: unknown;
  changeReason: unknown;
}): PolicyUpdateValidationResult {
  const errors: string[] = [];
  const normalizedPatch: PolicyUpdatePatch = {};
  const normalizedChangedBy =
    typeof changedBy === "string" ? changedBy.trim() : "";
  const normalizedChangeReason =
    typeof changeReason === "string" ? changeReason.trim() : "";

  if (!normalizedChangedBy) {
    errors.push("Changed by is required.");
  }

  if (!normalizedChangeReason) {
    errors.push("Change reason is required.");
  }

  const unknownFields = Object.keys(patch).filter(
    (field) => !allowedPatchFields.has(field)
  );

  if (unknownFields.length > 0) {
    errors.push(`Unknown patch fields: ${unknownFields.join(", ")}.`);
  }

  if (Object.hasOwn(patch, "tier")) {
    const tier = patch.tier;

    if (
      typeof tier !== "string" ||
      !autonomyTiers.includes(tier as AutonomyTier)
    ) {
      errors.push("Tier must be shadow, supervised, bounded, or autonomous.");
    } else if (
      tier === "autonomous" &&
      existingPolicy.tier !== "autonomous"
    ) {
      errors.push("Autonomous upgrades are disabled in this prototype.");
    } else {
      normalizedPatch.tier = tier as AutonomyTier;
    }
  }

  if (Object.hasOwn(patch, "confidence_floor")) {
    const confidenceFloor = normalizeNumber(patch.confidence_floor);

    if (
      confidenceFloor === null ||
      confidenceFloor < 0.75 ||
      confidenceFloor > 1
    ) {
      errors.push("Confidence floor must be between 0.75 and 1.00.");
    } else {
      normalizedPatch.confidence_floor = confidenceFloor;
    }
  }

  if (Object.hasOwn(patch, "max_blast_radius")) {
    const maxBlastRadius = normalizeNumber(patch.max_blast_radius);

    if (
      maxBlastRadius === null ||
      !Number.isInteger(maxBlastRadius) ||
      maxBlastRadius < 0 ||
      maxBlastRadius > 1
    ) {
      errors.push("Max blast radius must be an integer between 0 and 1.");
    } else {
      normalizedPatch.max_blast_radius = maxBlastRadius;
    }
  }

  if (Object.hasOwn(patch, "requires_reversible")) {
    const requiresReversible = patch.requires_reversible;

    if (typeof requiresReversible !== "boolean") {
      errors.push("Requires reversible must be a boolean.");
    } else if (
      !requiresReversible &&
      !(
        existingPolicy.action_type === "update_account_health" &&
        existingPolicy.segment === "linked_account"
      )
    ) {
      errors.push(
        "Non-reversible execution is not allowed for this action and segment."
      );
    } else {
      normalizedPatch.requires_reversible = requiresReversible;
    }
  }

  const changedFields = Object.entries(normalizedPatch).filter(
    ([field, value]) =>
      existingPolicy[field as keyof PolicyUpdatePatch] !== value
  );

  if (
    unknownFields.length === 0 &&
    Object.keys(patch).length > 0 &&
    changedFields.length === 0 &&
    errors.length === 0
  ) {
    errors.push("Policy update must change at least one field.");
  } else if (Object.keys(patch).length === 0) {
    errors.push("Policy update must change at least one field.");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      patch: Object.fromEntries(changedFields) as PolicyUpdatePatch,
      changedBy: normalizedChangedBy,
      changeReason: normalizedChangeReason,
    },
  };
}
