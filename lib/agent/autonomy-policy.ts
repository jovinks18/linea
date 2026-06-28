export type AutonomyTier =
  | "shadow"
  | "supervised"
  | "bounded"
  | "autonomous";

export type ActionAutonomyPolicy = {
  action_type: string;
  segment: string | null;
  tier: AutonomyTier;
  confidence_floor: number;
  max_blast_radius: number;
  requires_reversible: boolean;
  updated_by: string | null;
  updated_at: Date;
};

export type ProposedAction = {
  action_type: string;
  confidence: number;
  blast_radius: number;
  reversible: boolean;
  breaker_tripped: boolean;
  segment?: string | null;
};

export type ExecutionDirective = {
  execute: boolean;
  status: "executed" | "suggested";
  enqueue_review?: boolean;
  counterfactual?: boolean;
  reason?: string;
};

export type AutonomyDecisionContext = {
  policy: ActionAutonomyPolicy;
};

export type AutonomySegment = "linked_account" | "unknown_account";

export function getAutonomySegment({
  accountId,
}: {
  accountId: number | null;
}): AutonomySegment {
  return accountId === null ? "unknown_account" : "linked_account";
}

function passesGuards(
  proposedAction: ProposedAction,
  policy: ActionAutonomyPolicy
) {
  return (
    Number.isFinite(proposedAction.confidence) &&
    proposedAction.confidence >= policy.confidence_floor &&
    Number.isFinite(proposedAction.blast_radius) &&
    proposedAction.blast_radius <= policy.max_blast_radius &&
    (!policy.requires_reversible || proposedAction.reversible) &&
    !proposedAction.breaker_tripped
  );
}

export function decide(
  proposedAction: ProposedAction,
  { policy }: AutonomyDecisionContext
): ExecutionDirective {
  if (policy.tier === "shadow") {
    return {
      execute: false,
      status: "suggested",
      counterfactual: true,
      reason: "shadow",
    };
  }

  if (policy.tier === "supervised") {
    return {
      execute: false,
      status: "suggested",
      enqueue_review: true,
      reason: "supervised",
    };
  }

  if (passesGuards(proposedAction, policy)) {
    return {
      execute: true,
      status: "executed",
    };
  }

  return {
    execute: false,
    status: "suggested",
    enqueue_review: true,
    reason: policy.tier === "bounded" ? "out_of_bounds" : "guard_failed",
  };
}

export function getRestrictiveDefaultPolicy(
  actionType: string,
  segment: string | null = null
): ActionAutonomyPolicy {
  return {
    action_type: actionType,
    segment,
    tier: "supervised",
    confidence_floor: 1,
    max_blast_radius: 0,
    requires_reversible: true,
    updated_by: "restrictive_default",
    updated_at: new Date(0),
  };
}
