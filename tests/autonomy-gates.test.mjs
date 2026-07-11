import assert from "node:assert/strict";
import {
  evaluateGate,
  isPolicyExemptAction,
} from "../lib/agent/autonomy-gates.ts";

function scorecard(overrides = {}) {
  return {
    action_type: "create_csm_task",
    eval_run_id: "eval-1",
    f1: 0.92,
    precision: 0.92,
    recall: 0.92,
    priority_exact: 1,
    unsafe_gate_rate: 0,
    sample_size: 25,
    computed_at: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  };
}

const promotionCases = [
  {
    name: "shadow to supervised",
    currentTier: "shadow",
    f1: 0.8,
    targetTier: "supervised",
  },
  {
    name: "supervised to bounded",
    currentTier: "supervised",
    f1: 0.9,
    targetTier: "bounded",
  },
];

for (const testCase of promotionCases) {
  const result = evaluateGate({
    actionType: "create_csm_task",
    segment: "linked_account",
    currentTier: testCase.currentTier,
    scorecard: scorecard({ f1: testCase.f1 }),
  });

  assert.equal(result.direction, "promote", testCase.name);
  assert.equal(result.target_tier, testCase.targetTier);
  assert.equal(result.reason, "scorecard_meets_promotion_gate");
  assert.equal(result.evidence.eval_run_id, "eval-1");
}

{
  const result = evaluateGate({
    actionType: "create_csm_task",
    segment: "linked_account",
    currentTier: "bounded",
    scorecard: scorecard({ f1: 0.96 }),
  });

  assert.equal(result.direction, "hold");
  assert.equal(result.target_tier, "bounded");
  assert.equal(result.reason, "autonomous_promotion_capped");
}

{
  const result = evaluateGate({
    actionType: "create_csm_task",
    segment: "unknown_account",
    currentTier: "supervised",
    scorecard: scorecard({ f1: 0.95 }),
  });

  assert.equal(result.direction, "hold");
  assert.equal(result.target_tier, "supervised");
  assert.equal(result.reason, "unknown_account_promotion_ceiling");
}

{
  const result = evaluateGate({
    actionType: "create_csm_task",
    segment: "unknown_account",
    currentTier: "shadow",
    scorecard: scorecard({ f1: 0.85 }),
  });

  assert.equal(result.direction, "promote");
  assert.equal(result.target_tier, "supervised");
}

{
  const result = evaluateGate({
    actionType: "create_csm_task",
    segment: "linked_account",
    currentTier: "bounded",
    scorecard: scorecard({ unsafe_gate_rate: 0.01 }),
  });

  assert.equal(result.direction, "demote");
  assert.equal(result.target_tier, "supervised");
  assert.equal(result.reason, "unsafe_gate_rate_positive");
}

{
  const result = evaluateGate({
    actionType: "create_csm_task",
    segment: "linked_account",
    currentTier: "bounded",
    scorecard: scorecard({ f1: 0.89 }),
  });

  assert.equal(result.direction, "demote");
  assert.equal(result.target_tier, "supervised");
  assert.equal(result.reason, "f1_below_current_tier_floor");
}

{
  const result = evaluateGate({
    actionType: "create_csm_task",
    segment: "linked_account",
    currentTier: "supervised",
    scorecard: scorecard({ f1: 0.85 }),
  });

  assert.equal(result.direction, "hold");
  assert.equal(result.reason, "f1_below_promotion_floor");
}

{
  const result = evaluateGate({
    actionType: "create_csm_task",
    segment: "linked_account",
    currentTier: "supervised",
    scorecard: scorecard({ f1: 0.95, sample_size: 5 }),
  });

  assert.equal(result.direction, "hold");
  assert.equal(result.reason, "insufficient_sample_size");
}

{
  assert.equal(isPolicyExemptAction("create_support_case"), true);
  assert.equal(isPolicyExemptAction("require_human_review"), true);
  assert.equal(isPolicyExemptAction("create_csm_task"), false);
}

console.log("PASS autonomy gates");
