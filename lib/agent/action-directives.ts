import type { PoolClient } from "pg";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { computeBlastRadius } from "./blast-radius.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { decide, getAutonomySegment } from "./autonomy-policy.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { resolveActionAutonomyPolicy } from "./autonomy-policy.repository.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { getClearCircuitBreakerState } from "./circuit-breaker.ts";
import type { BlastRadiusScope } from "./blast-radius";
import type {
  CircuitBreakerSource,
  CircuitBreakerState,
} from "./circuit-breaker";
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
  blast_radius: number;
  blast_radius_scope: BlastRadiusScope;
  blast_radius_reason: string;
  reversible: boolean;
  breaker_tripped: boolean;
  breaker_reasons: string[];
  breaker_keys: string[];
  breaker_source: CircuitBreakerSource;
  segment: string;
};

function isReversible(actionType: string) {
  return actionType !== "update_account_health";
}

function buildProposedAction({
  actionType,
  confidence,
  blastRadius,
  breakerState,
  segment,
}: {
  actionType: string;
  confidence: number;
  blastRadius: number;
  breakerState: CircuitBreakerState;
  segment: string;
}): ProposedAction {
  return {
    action_type: actionType,
    confidence,
    blast_radius: blastRadius,
    reversible: isReversible(actionType),
    breaker_tripped: breakerState.tripped,
    segment,
  };
}

export async function buildActionDirectives({
  client,
  policyDecision,
  accountId,
  caseId = null,
  affectedAccountIds,
  affectedCustomerIds,
  isBatch = false,
  isPolicyChange = false,
  breakerStates = new Map(),
}: {
  client: PoolClient;
  policyDecision: PolicyDecision;
  accountId: number | null;
  caseId?: number | null;
  affectedAccountIds?: number[];
  affectedCustomerIds?: number[];
  isBatch?: boolean;
  isPolicyChange?: boolean;
  breakerStates?: ReadonlyMap<string, CircuitBreakerState>;
}): Promise<ActionDirective[]> {
  const segment = getAutonomySegment({ accountId });
  const directives: ActionDirective[] = [];

  for (const actionType of policyDecision.recommended_actions) {
    const blastRadius = computeBlastRadius({
      action_type: actionType,
      case_id: caseId,
      account_id: accountId,
      affected_account_ids: affectedAccountIds,
      affected_customer_ids: affectedCustomerIds,
      is_batch: isBatch,
      is_policy_change: isPolicyChange,
    });
    const breakerState =
      breakerStates.get(actionType) ?? getClearCircuitBreakerState();
    const proposedAction = buildProposedAction({
      actionType,
      confidence: policyDecision.confidence,
      blastRadius: blastRadius.value,
      breakerState,
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
      blast_radius: proposedAction.blast_radius,
      blast_radius_scope: blastRadius.scope,
      blast_radius_reason: blastRadius.reason,
      reversible: proposedAction.reversible,
      breaker_tripped: breakerState.tripped,
      breaker_reasons: breakerState.reasons,
      breaker_keys: breakerState.breaker_keys,
      breaker_source: breakerState.source,
      segment,
    });
  }

  return directives;
}
