import assert from "node:assert/strict";
import {
  simulatePolicyImpact,
} from "../lib/agent/autonomy-policy-simulation.ts";

function policy(overrides = {}) {
  return {
    action_type: "create_csm_task",
    segment: "linked_account",
    tier: "bounded",
    confidence_floor: 0.8,
    max_blast_radius: 1,
    requires_reversible: true,
    updated_by: "test",
    updated_at: new Date("2026-06-30T00:00:00.000Z"),
    ...overrides,
  };
}

function action(id, status, overrides = {}) {
  return {
    id: String(id),
    case_id: id,
    case_number: `LIN-${id}`,
    account_id: 1,
    action_type: "create_csm_task",
    status,
    confidence: 0.85,
    metadata: {
      blast_radius: 1,
      blast_radius_scope: "account",
      reversible: true,
      breaker_tripped: false,
      segment: "linked_account",
    },
    created_at: new Date(`2026-06-30T00:00:0${id}.000Z`),
    ...overrides,
  };
}

{
  const impact = simulatePolicyImpact({
    policy: policy(),
    actions: [
      action(1, "executed", {
        metadata: {
          blast_radius: 1,
          blast_radius_scope: "account",
          reversible: true,
          breaker_tripped: true,
          breaker_reasons: ["Synthetic breaker"],
          segment: "linked_account",
        },
      }),
    ],
  });

  assert.equal(impact.would_change_executed_to_suggested, 1);
  assert.equal(impact.guard_failures, 1);
  assert.match(impact.sample_impacts[0].reason, /breaker tripped/);
  assert.match(impact.sample_impacts[0].reason, /Synthetic breaker/);
}

{
  const impact = simulatePolicyImpact({
    policy: policy(),
    actions: [
      action(2, "executed", {
        metadata: {
          blast_radius: 1,
          blast_radius_scope: "account",
          reversible: true,
          segment: "linked_account",
        },
      }),
    ],
  });

  assert.equal(impact.would_remain_executed, 1);
  assert.match(
    impact.limitations.join(" "),
    /Breaker metadata missing; assumed not tripped/
  );
  assert.match(
    impact.sample_impacts[0].reason,
    /breaker metadata missing, assumed not tripped/
  );
}

{
  const impact = simulatePolicyImpact({
    policy: policy(),
    actions: [action(1, "suggested")],
  });

  assert.equal(impact.would_change_suggested_to_executed, 1);
  assert.equal(impact.sample_impacts[0].simulated_status, "executed");
  assert.equal(impact.sample_impacts[0].blast_radius_scope, "account");
}

{
  const impact = simulatePolicyImpact({
    policy: policy({ confidence_floor: 0.9 }),
    actions: [action(2, "executed")],
  });

  assert.equal(impact.would_change_executed_to_suggested, 1);
  assert.equal(impact.guard_failures, 1);
  assert.match(impact.sample_impacts[0].reason, /confidence below floor/);
}

{
  const impact = simulatePolicyImpact({
    policy: policy(),
    actions: [action(3, "executed", { confidence: 0.95 })],
  });

  assert.equal(impact.would_remain_executed, 1);
}

{
  const impact = simulatePolicyImpact({
    policy: policy({ tier: "supervised" }),
    actions: [action(4, "suggested")],
  });

  assert.equal(impact.would_remain_suggested, 1);
  assert.equal(impact.sample_impacts[0].reason, "supervised");
}

{
  const impact = simulatePolicyImpact({
    policy: policy(),
    actions: [action(5, "skipped"), action(6, "failed")],
  });

  assert.equal(impact.would_remain_skipped_or_failed, 2);
  assert.deepEqual(
    impact.sample_impacts.map((sample) => sample.simulated_status),
    ["skipped", "failed"]
  );
}

{
  const impact = simulatePolicyImpact({
    policy: policy(),
    actions: [
      action(7, "suggested", {
        metadata: { segment: "linked_account" },
      }),
    ],
  });

  assert.equal(impact.not_simulatable, 1);
  assert.equal(
    impact.sample_impacts[0].reason,
    "missing directive metadata"
  );
}

{
  const impact = simulatePolicyImpact({
    policy: policy(),
    actions: [
      action(8, "suggested", { action_type: "log_product_signal" }),
      action(9, "suggested", {
        metadata: {
          blast_radius: 1,
          reversible: true,
          segment: "unknown_account",
        },
      }),
    ],
  });

  assert.equal(impact.total_actions_examined, 2);
  assert.equal(impact.actions_matching_policy_scope, 0);
  assert.equal(impact.sample_impacts.length, 0);
}

{
  const impact = simulatePolicyImpact({
    policy: policy({ max_blast_radius: 0 }),
    actions: [action(1, "executed")],
  });

  assert.equal(impact.guard_failures, 1);
  assert.equal(impact.would_change_executed_to_suggested, 1);
  assert.match(impact.sample_impacts[0].reason, /blast radius exceeds limit/);
}

console.log("PASS autonomy policy simulation");
