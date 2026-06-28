import type { PoolClient } from "pg";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { decide, getAutonomySegment } from "./autonomy-policy.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { resolveActionAutonomyPolicy } from "./autonomy-policy.repository.ts";
import type {
  AutonomyTier,
  ProposedAction,
} from "./autonomy-policy";
import type { PolicyDecision } from "./types";

export type ActionDirective = {
  action_type: string;
  execute: boolean;
  status: "executed" | "suggested";
  enqueue_review?: boolean;
  counterfactual?: boolean;
  reason?: string;
  tier: AutonomyTier;
  confidence_floor: number;
  max_blast_radius: number;
  requires_reversible: boolean;
};

function getBlastRadius(actionType: string) {
  return actionType === "require_human_review" ? 0 : 1;
}

function isReversible(actionType: string) {
  return actionType !== "update_account_health";
}

function buildProposedAction({
  actionType,
  confidence,
  breakerTripped,
  segment,
}: {
  actionType: string;
  confidence: number;
  breakerTripped: boolean;
  segment: string;
}): ProposedAction {
  return {
    action_type: actionType,
    confidence,
    blast_radius: getBlastRadius(actionType),
    reversible: isReversible(actionType),
    breaker_tripped: breakerTripped,
    segment,
  };
}

export async function buildActionDirectives({
  client,
  policyDecision,
  accountId,
  breakerTripped = false,
}: {
  client: PoolClient;
  policyDecision: PolicyDecision;
  accountId: number | null;
  breakerTripped?: boolean;
}): Promise<ActionDirective[]> {
  const segment = getAutonomySegment({ accountId });
  const directives: ActionDirective[] = [];

  for (const actionType of policyDecision.recommended_actions) {
    const proposedAction = buildProposedAction({
      actionType,
      confidence: policyDecision.confidence,
      breakerTripped,
      segment,
    });
    const policy = await resolveActionAutonomyPolicy(
      client,
      actionType,
      segment
    );
    const directive = decide(proposedAction, { policy });

    directives.push({
      action_type: actionType,
      ...directive,
      tier: policy.tier,
      confidence_floor: policy.confidence_floor,
      max_blast_radius: policy.max_blast_radius,
      requires_reversible: policy.requires_reversible,
    });
  }

  return directives;
}
