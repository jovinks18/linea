import assert from "node:assert/strict";
import { runAutonomyGates } from "../lib/agent/autonomy-gate-runner.ts";

function policyRow({
  actionType,
  segment,
  tier,
  confidenceFloor = "0.90",
  requiresReversible = true,
} = {}) {
  return {
    action_type: actionType,
    segment,
    tier,
    confidence_floor: confidenceFloor,
    max_blast_radius: 1,
    requires_reversible: requiresReversible,
    updated_by: "seed",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}

function scorecardRow({
  actionType,
  evalRunId,
  f1,
  unsafeGateRate = "0",
} = {}) {
  return {
    action_type: actionType,
    eval_run_id: evalRunId,
    f1,
    precision: f1,
    recall: f1,
    priority_exact: "1",
    unsafe_gate_rate: unsafeGateRate,
    sample_size: 25,
    computed_at: "2026-07-01T01:00:00.000Z",
  };
}

function createFakeClient() {
  const calls = [];
  const audits = [];
  const requests = [];
  const policies = [
    policyRow({
      actionType: "create_support_case",
      segment: "linked_account",
      tier: "bounded",
    }),
    policyRow({
      actionType: "create_csm_task",
      segment: "linked_account",
      tier: "supervised",
    }),
    policyRow({
      actionType: "log_product_signal",
      segment: "linked_account",
      tier: "bounded",
    }),
    policyRow({
      actionType: "update_account_health",
      segment: "unknown_account",
      tier: "supervised",
    }),
    policyRow({
      actionType: "detect_onboarding_blocker",
      segment: "linked_account",
      tier: "bounded",
    }),
  ];
  const scorecards = [
    scorecardRow({
      actionType: "create_csm_task",
      evalRunId: "eval-promote",
      f1: "0.92",
    }),
    scorecardRow({
      actionType: "log_product_signal",
      evalRunId: "eval-demote",
      f1: "0.50",
    }),
    scorecardRow({
      actionType: "update_account_health",
      evalRunId: "eval-unknown-ceiling",
      f1: "0.95",
    }),
  ];

  return {
    calls,
    audits,
    requests,
    async query(sql, values = []) {
      calls.push({ sql, values });

      if (
        sql.includes("FROM action_autonomy_policy") &&
        sql.includes("ORDER BY") &&
        !sql.includes("FOR UPDATE")
      ) {
        return { rows: policies };
      }

      if (sql.includes("FROM model_scorecard")) {
        return { rows: scorecards };
      }

      if (
        sql.includes("FROM action_autonomy_policy_change_requests") &&
        sql.includes("status = 'pending'")
      ) {
        return { rows: [] };
      }

      if (sql.includes("INSERT INTO action_autonomy_policy_change_requests")) {
        const request = {
          id: "request-1",
          action_type: values[0],
          segment: values[1],
          old_policy: JSON.parse(values[2]),
          proposed_policy: JSON.parse(values[3]),
          patch: JSON.parse(values[4]),
          status: "pending",
          requested_by: values[5],
          request_reason: values[6],
          eval_run_id: values[7],
          f1: values[8],
          unsafe_gate_rate: values[9],
          sample_size: values[10],
          gate_run_id: values[11],
          reviewed_by: null,
          review_reason: null,
          reviewed_at: null,
          created_at: "2026-07-01T02:00:00.000Z",
          updated_at: "2026-07-01T02:00:00.000Z",
        };
        requests.push(request);
        return { rows: [request] };
      }

      if (
        sql.includes("FROM action_autonomy_policy") &&
        sql.includes("FOR UPDATE")
      ) {
        const [actionType, segment] = values;
        return {
          rows: policies.filter(
            (policy) =>
              policy.action_type === actionType && policy.segment === segment
          ),
        };
      }

      if (sql.includes("UPDATE action_autonomy_policy")) {
        const [actionType, segment, tier, updatedBy] = values;
        const policy = policies.find(
          (candidate) =>
            candidate.action_type === actionType &&
            candidate.segment === segment
        );
        Object.assign(policy, {
          tier,
          updated_by: updatedBy,
          updated_at: "2026-07-01T02:00:00.000Z",
        });
        return { rows: [policy] };
      }

      if (sql.includes("INSERT INTO action_autonomy_policy_audit")) {
        audits.push({ sql, values });
        return { rows: [{ id: String(audits.length) }] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

const client = createFakeClient();
const summary = await runAutonomyGates({
  client,
  gateRunId: "gate-test",
});

assert.equal(summary.evaluated, 4);
assert.equal(summary.promoted_requests, 1);
assert.equal(summary.demotions, 1);
assert.equal(summary.holds, 2);

const promotion = summary.items.find(
  (item) => item.action_type === "create_csm_task"
);
assert.equal(promotion.direction, "promote");
assert.equal(promotion.target_tier, "bounded");
assert.equal(promotion.request_id, "request-1");
assert.equal(client.requests[0].eval_run_id, "eval-promote");
assert.equal(client.requests[0].gate_run_id, "gate-test");

const demotion = summary.items.find(
  (item) => item.action_type === "log_product_signal"
);
assert.equal(demotion.direction, "demote");
assert.equal(demotion.target_tier, "supervised");

const demotionAudit = client.audits.find(
  (audit) => audit.values[4] === "auto_demoted"
);
assert.ok(demotionAudit);
assert.equal(demotionAudit.values[7], "eval-demote");
assert.equal(demotionAudit.values[8], 0.5);
assert.equal(demotionAudit.values[9], 0);
assert.equal(demotionAudit.values[10], 25);
assert.equal(demotionAudit.values[11], "gate-test");

const requestAudit = client.audits.find(
  (audit) => audit.values[4] === "requested"
);
assert.ok(requestAudit);
assert.equal(requestAudit.values[7], "eval-promote");
assert.equal(requestAudit.values[11], "gate-test");

const unknown = summary.items.find(
  (item) => item.action_type === "update_account_health"
);
assert.equal(unknown.direction, "hold");
assert.equal(unknown.reason, "unknown_account_promotion_ceiling");

assert.ok(
  !summary.items.some((item) => item.action_type === "create_support_case")
);

console.log("PASS autonomy gate runner");
