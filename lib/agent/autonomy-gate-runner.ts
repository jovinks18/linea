import type { PoolClient } from "pg";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { createActionAutonomyPolicyChangeRequest } from "./autonomy-policy-change-request.repository.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { applyAutomaticPolicyDemotionWithAudit, listActionAutonomyPolicies } from "./autonomy-policy.repository.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { DEFAULT_AUTONOMY_GATE_CONFIG, evaluateGate, isPolicyExemptAction } from "./autonomy-gates.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { listLatestModelScorecardsByActionType } from "./model-scorecard.repository.ts";
import type { AutonomyTier } from "./autonomy-policy";
import type {
  AutonomyGateConfig,
  GateDirection,
  GateEvaluation,
} from "./autonomy-gates";

export type AutonomyGateRunSummaryItem = {
  action_type: string;
  segment: string | null;
  current_tier: AutonomyTier;
  direction: GateDirection;
  target_tier: AutonomyTier;
  reason: string;
  eval_run_id: string | null;
  gate_run_id: string;
  request_id?: string;
};

export type AutonomyGateRunSummary = {
  gate_run_id: string;
  evaluated: number;
  promoted_requests: number;
  demotions: number;
  holds: number;
  items: AutonomyGateRunSummaryItem[];
};

function buildGateEvidence(evaluation: GateEvaluation, gateRunId: string) {
  return {
    eval_run_id: evaluation.evidence.eval_run_id,
    f1: evaluation.evidence.f1,
    unsafe_gate_rate: evaluation.evidence.unsafe_gate_rate,
    sample_size: evaluation.evidence.sample_size,
    gate_run_id: gateRunId,
  };
}

function buildGateReason(evaluation: GateEvaluation, gateRunId: string) {
  return [
    `autonomy_gate:${evaluation.reason}`,
    `gate_run_id:${gateRunId}`,
    `eval_run_id:${evaluation.evidence.eval_run_id}`,
    `f1:${evaluation.evidence.f1.toFixed(3)}`,
    `unsafe_gate_rate:${evaluation.evidence.unsafe_gate_rate.toFixed(3)}`,
    `sample_size:${evaluation.evidence.sample_size}`,
  ].join(" ");
}

async function findPendingTierPromotionRequest(
  client: PoolClient,
  {
    actionType,
    segment,
    targetTier,
  }: {
    actionType: string;
    segment: string | null;
    targetTier: AutonomyTier;
  }
): Promise<string | null> {
  const result = await client.query<{ id: string | number }>(
    `SELECT id
     FROM action_autonomy_policy_change_requests
     WHERE action_type = $1
       AND segment IS NOT DISTINCT FROM $2
       AND status = 'pending'
       AND patch->>'tier' = $3
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [actionType, segment, targetTier]
  );

  const id = result.rows[0]?.id;
  return id === undefined ? null : String(id);
}

export async function runAutonomyGates({
  client,
  gateRunId,
  config = DEFAULT_AUTONOMY_GATE_CONFIG,
}: {
  client: PoolClient;
  gateRunId: string;
  config?: AutonomyGateConfig;
}): Promise<AutonomyGateRunSummary> {
  const policies = await listActionAutonomyPolicies(client);
  const scorecards = await listLatestModelScorecardsByActionType(client);
  const items: AutonomyGateRunSummaryItem[] = [];
  let promotedRequests = 0;
  let demotions = 0;

  for (const policy of policies) {
    if (isPolicyExemptAction(policy.action_type)) continue;

    const scorecard = scorecards.get(policy.action_type);

    if (!scorecard) {
      items.push({
        action_type: policy.action_type,
        segment: policy.segment,
        current_tier: policy.tier,
        direction: "hold",
        target_tier: policy.tier,
        reason: "no_scorecard",
        eval_run_id: null,
        gate_run_id: gateRunId,
      });
      continue;
    }

    // The scorecard is action_type-level; every segment row for that action is
    // evaluated against the same evidence, then segment-specific ceilings apply.
    const evaluation = evaluateGate({
      actionType: policy.action_type,
      segment: policy.segment,
      currentTier: policy.tier,
      scorecard,
      config,
    });

    if (evaluation.direction === "promote") {
      const existingRequestId = await findPendingTierPromotionRequest(client, {
        actionType: policy.action_type,
        segment: policy.segment,
        targetTier: evaluation.target_tier,
      });

      if (existingRequestId) {
        items.push({
          action_type: policy.action_type,
          segment: policy.segment,
          current_tier: policy.tier,
          direction: "hold",
          target_tier: evaluation.target_tier,
          reason: "pending_promotion_request_exists",
          eval_run_id: evaluation.evidence.eval_run_id,
          gate_run_id: gateRunId,
          request_id: existingRequestId,
        });
        continue;
      }

      const request = await createActionAutonomyPolicyChangeRequest(client, {
        action_type: policy.action_type,
        segment: policy.segment,
        old_policy: policy,
        proposed_policy: {
          ...policy,
          tier: evaluation.target_tier,
          updated_by: gateRunId,
          updated_at: new Date(),
        },
        patch: { tier: evaluation.target_tier },
        requested_by: gateRunId,
        request_reason: buildGateReason(evaluation, gateRunId),
        gate_evidence: buildGateEvidence(evaluation, gateRunId),
      });
      promotedRequests += 1;

      items.push({
        action_type: policy.action_type,
        segment: policy.segment,
        current_tier: policy.tier,
        direction: "promote",
        target_tier: evaluation.target_tier,
        reason: evaluation.reason,
        eval_run_id: evaluation.evidence.eval_run_id,
        gate_run_id: gateRunId,
        request_id: request.id,
      });
      continue;
    }

    if (evaluation.direction === "demote") {
      await applyAutomaticPolicyDemotionWithAudit(client, {
        action_type: policy.action_type,
        segment: policy.segment,
        target_tier: evaluation.target_tier,
        gate_run_id: gateRunId,
        change_reason: buildGateReason(evaluation, gateRunId),
        gate_evidence: buildGateEvidence(evaluation, gateRunId),
      });
      demotions += 1;
    }

    items.push({
      action_type: policy.action_type,
      segment: policy.segment,
      current_tier: policy.tier,
      direction: evaluation.direction,
      target_tier: evaluation.target_tier,
      reason: evaluation.reason,
      eval_run_id: evaluation.evidence.eval_run_id,
      gate_run_id: gateRunId,
    });
  }

  return {
    gate_run_id: gateRunId,
    evaluated: items.length,
    promoted_requests: promotedRequests,
    demotions,
    holds: items.filter((item) => item.direction === "hold").length,
    items,
  };
}
