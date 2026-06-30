import type { PoolClient } from "pg";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { decide } from "./autonomy-policy.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { listRecentAgentActionsForSimulation } from "./action-history.repository.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { getActionAutonomyPolicyChangeRequest } from "./autonomy-policy-change-request.repository.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import * as policyRepository from "./autonomy-policy.repository.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { validatePolicyUpdate } from "./autonomy-policy-validation.ts";
import type { AgentActionSimulationRecord } from "./action-history.repository";
import type {
  ActionAutonomyPolicy,
  ProposedAction,
} from "./autonomy-policy";

export type PolicyImpactStatus =
  | "executed"
  | "suggested"
  | "skipped"
  | "failed"
  | "not_simulatable";

export type PolicyImpactSample = {
  id: string;
  case_id: number | null;
  case_number: string | null;
  current_status: PolicyImpactStatus;
  simulated_status: PolicyImpactStatus;
  reason: string;
  confidence: number | null;
  blast_radius_scope: string | null;
  created_at: string;
};

export type PolicyImpactSummary = {
  total_actions_examined: number;
  actions_matching_policy_scope: number;
  would_remain_executed: number;
  would_remain_suggested: number;
  would_change_suggested_to_executed: number;
  would_change_executed_to_suggested: number;
  would_remain_skipped_or_failed: number;
  not_simulatable: number;
  guard_failures: number;
  sample_impacts: PolicyImpactSample[];
  limitations: string[];
};

export class ActionAutonomyPolicySimulationDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionAutonomyPolicySimulationDataError";
  }
}

function emptySummary(totalActionsExamined: number): PolicyImpactSummary {
  return {
    total_actions_examined: totalActionsExamined,
    actions_matching_policy_scope: 0,
    would_remain_executed: 0,
    would_remain_suggested: 0,
    would_change_suggested_to_executed: 0,
    would_change_executed_to_suggested: 0,
    would_remain_skipped_or_failed: 0,
    not_simulatable: 0,
    guard_failures: 0,
    sample_impacts: [],
    limitations: [],
  };
}

function hasSegmentMetadata(metadata: Record<string, unknown>) {
  return Object.hasOwn(metadata, "segment");
}

function normalizeSegment(metadata: Record<string, unknown>) {
  const value = metadata.segment;
  return value === null || typeof value === "string" ? value : undefined;
}

function getMissingDirectiveMetadata(
  action: AgentActionSimulationRecord
): string[] {
  const missing: string[] = [];

  if (action.confidence === null) missing.push("confidence");
  if (!Number.isFinite(action.metadata.blast_radius)) {
    missing.push("blast_radius");
  }
  if (typeof action.metadata.blast_radius_scope !== "string") {
    missing.push("blast_radius_scope");
  }
  if (typeof action.metadata.reversible !== "boolean") {
    missing.push("reversible");
  }
  if (!hasSegmentMetadata(action.metadata)) missing.push("segment");

  return missing;
}

function buildProposedAction(
  action: AgentActionSimulationRecord
): ProposedAction {
  return {
    action_type: action.action_type,
    confidence: action.confidence as number,
    blast_radius: Number(action.metadata.blast_radius),
    reversible: action.metadata.reversible as boolean,
    breaker_tripped:
      typeof action.metadata.breaker_tripped === "boolean"
        ? action.metadata.breaker_tripped
        : false,
    segment: normalizeSegment(action.metadata),
  };
}

const missingBreakerEvidenceNote =
  "Breaker metadata missing; assumed not tripped for historical simulation.";

function addLimitation(summary: PolicyImpactSummary, limitation: string) {
  if (!summary.limitations.includes(limitation)) {
    summary.limitations.push(limitation);
  }
}

function getGuardFailureReason(
  proposedAction: ProposedAction,
  policy: ActionAutonomyPolicy
) {
  const failures: string[] = [];

  if (proposedAction.confidence < policy.confidence_floor) {
    failures.push("confidence below floor");
  }
  if (proposedAction.blast_radius > policy.max_blast_radius) {
    failures.push("blast radius exceeds limit");
  }
  if (policy.requires_reversible && !proposedAction.reversible) {
    failures.push("action is not reversible");
  }
  if (proposedAction.breaker_tripped) {
    failures.push("breaker tripped");
  }

  return failures.length > 0 ? failures.join(", ") : "policy guard failed";
}

function addSample(
  summary: PolicyImpactSummary,
  action: AgentActionSimulationRecord,
  simulatedStatus: PolicyImpactStatus,
  reason: string,
  sampleLimit: number
) {
  if (summary.sample_impacts.length >= sampleLimit) return;

  summary.sample_impacts.push({
    id: action.id,
    case_id: action.case_id,
    case_number: action.case_number,
    current_status: action.status,
    simulated_status: simulatedStatus,
    reason,
    confidence: action.confidence,
    blast_radius_scope:
      typeof action.metadata.blast_radius_scope === "string"
        ? action.metadata.blast_radius_scope
        : null,
    created_at: action.created_at.toISOString(),
  });
}

export function simulatePolicyImpact({
  policy,
  actions,
  sampleLimit = 10,
}: {
  policy: ActionAutonomyPolicy;
  actions: AgentActionSimulationRecord[];
  sampleLimit?: number;
}): PolicyImpactSummary {
  const summary = emptySummary(actions.length);
  const normalizedSampleLimit = Math.max(0, Math.min(25, sampleLimit));

  if (policy.segment === null) {
    summary.limitations.push(
      "Default policy simulation includes only history explicitly recorded without a segment; segment-specific directives are excluded."
    );
  }

  for (const action of actions) {
    if (action.action_type !== policy.action_type) continue;

    if (!hasSegmentMetadata(action.metadata)) {
      summary.not_simulatable += 1;
      addSample(
        summary,
        action,
        "not_simulatable",
        "missing directive metadata",
        normalizedSampleLimit
      );
      continue;
    }

    const actionSegment = normalizeSegment(action.metadata);
    if (actionSegment === undefined || actionSegment !== policy.segment) {
      continue;
    }

    summary.actions_matching_policy_scope += 1;

    const missingMetadata = getMissingDirectiveMetadata(action);
    if (missingMetadata.length > 0) {
      summary.not_simulatable += 1;
      addSample(
        summary,
        action,
        "not_simulatable",
        "missing directive metadata",
        normalizedSampleLimit
      );
      continue;
    }

    if (action.status === "skipped" || action.status === "failed") {
      summary.would_remain_skipped_or_failed += 1;
      addSample(
        summary,
        action,
        action.status,
        "Historical skipped and failed outcomes are not replayed.",
        normalizedSampleLimit
      );
      continue;
    }

    const proposedAction = buildProposedAction(action);
    const breakerEvidenceMissing =
      typeof action.metadata.breaker_tripped !== "boolean";
    if (breakerEvidenceMissing) {
      addLimitation(summary, missingBreakerEvidenceNote);
    }
    const directive = decide(proposedAction, { policy });
    const simulatedStatus = directive.execute ? "executed" : "suggested";
    let reason = directive.reason ?? "policy guards pass";

    if (directive.reason === "out_of_bounds" || directive.reason === "guard_failed") {
      summary.guard_failures += 1;
      reason = getGuardFailureReason(proposedAction, policy);

      if (
        proposedAction.breaker_tripped &&
        Array.isArray(action.metadata.breaker_reasons)
      ) {
        const breakerReasons = action.metadata.breaker_reasons.filter(
          (value): value is string => typeof value === "string"
        );
        if (breakerReasons.length > 0) {
          reason = `${reason}: ${breakerReasons.join("; ")}`;
        }
      }
    }
    if (breakerEvidenceMissing) {
      reason = `${reason}; breaker metadata missing, assumed not tripped`;
    }

    if (action.status === "executed" && simulatedStatus === "executed") {
      summary.would_remain_executed += 1;
    } else if (
      action.status === "suggested" &&
      simulatedStatus === "suggested"
    ) {
      summary.would_remain_suggested += 1;
    } else if (
      action.status === "suggested" &&
      simulatedStatus === "executed"
    ) {
      summary.would_change_suggested_to_executed += 1;
    } else if (
      action.status === "executed" &&
      simulatedStatus === "suggested"
    ) {
      summary.would_change_executed_to_suggested += 1;
    }

    addSample(
      summary,
      action,
      simulatedStatus,
      reason,
      normalizedSampleLimit
    );
  }

  return summary;
}

export async function simulatePolicyImpactFromHistory(
  client: PoolClient,
  {
    policy,
    limit = 100,
  }: {
    policy: ActionAutonomyPolicy;
    limit?: number;
  }
) {
  const actions = await listRecentAgentActionsForSimulation(client, {
    actionType: policy.action_type,
    segment: policy.segment,
    limit,
  });

  return simulatePolicyImpact({ policy, actions });
}

export async function simulatePolicyPatchImpact(
  client: PoolClient,
  input: {
    action_type: string;
    segment: string | null;
    patch: Record<string, unknown>;
    limit?: number;
  }
) {
  const existingPolicy = await policyRepository.findActionAutonomyPolicy(
    client,
    input.action_type,
    input.segment
  );

  if (!existingPolicy) {
    throw new policyRepository.ActionAutonomyPolicyNotFoundError(
      input.action_type,
      input.segment
    );
  }

  const validation = validatePolicyUpdate({
    existingPolicy,
    patch: input.patch,
    changedBy: "simulation",
    changeReason: "Read-only policy impact preview",
  });

  if (!validation.valid) {
    throw new policyRepository.ActionAutonomyPolicyValidationError(
      validation.errors
    );
  }

  const proposedPolicy: ActionAutonomyPolicy = {
    ...existingPolicy,
    ...validation.value.patch,
    updated_by: "simulation",
    updated_at: new Date(),
  };

  return {
    proposed_policy: proposedPolicy,
    impact: await simulatePolicyImpactFromHistory(client, {
      policy: proposedPolicy,
      limit: input.limit,
    }),
  };
}

export async function simulatePolicyChangeRequestImpact(
  client: PoolClient,
  {
    requestId,
    limit = 100,
  }: {
    requestId: string;
    limit?: number;
  }
) {
  const request = await getActionAutonomyPolicyChangeRequest(
    client,
    requestId
  );

  if (!request) return null;

  if (
    request.proposed_policy.action_type !== request.action_type ||
    request.proposed_policy.segment !== request.segment
  ) {
    throw new ActionAutonomyPolicySimulationDataError(
      "The proposed policy snapshot does not match the change request scope."
    );
  }

  return {
    request_id: request.id,
    request_status: request.status,
    proposed_policy: request.proposed_policy,
    impact: await simulatePolicyImpactFromHistory(client, {
      policy: request.proposed_policy,
      limit,
    }),
  };
}
