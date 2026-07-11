import assert from "node:assert/strict";
import {
  insertActionAutonomyPolicyAudit,
  listActionAutonomyPolicyAudits,
} from "../lib/agent/autonomy-policy-audit.repository.ts";

function createSnapshot({
  actionType = "create_csm_task",
  segment = "linked_account",
  tier = "bounded",
  confidenceFloor = 0.8,
} = {}) {
  return {
    action_type: actionType,
    segment,
    tier,
    confidence_floor: confidenceFloor,
    max_blast_radius: 1,
    requires_reversible: true,
    updated_by: "operator@example.invalid",
    updated_at: new Date("2026-06-28T12:00:00.000Z"),
  };
}

{
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [{ id: "41" }] };
    },
  };
  const oldPolicy = createSnapshot({ confidenceFloor: 0.9 });
  const newPolicy = createSnapshot({ confidenceFloor: 0.8 });
  const id = await insertActionAutonomyPolicyAudit(client, {
    action_type: "create_csm_task",
    segment: "linked_account",
    old_policy: oldPolicy,
    new_policy: newPolicy,
    change_type: "updated",
    changed_by: "operator@example.invalid",
    change_reason: "Synthetic policy review",
  });

  assert.equal(id, "41");
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO action_autonomy_policy_audit/);
  assert.deepEqual(JSON.parse(calls[0].values[2]), {
    ...oldPolicy,
    updated_at: "2026-06-28T12:00:00.000Z",
  });
  assert.deepEqual(JSON.parse(calls[0].values[3]), {
    ...newPolicy,
    updated_at: "2026-06-28T12:00:00.000Z",
  });
}

{
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [{ id: 42 }] };
    },
  };
  const id = await insertActionAutonomyPolicyAudit(client, {
    action_type: "create_support_case",
    segment: null,
    old_policy: null,
    new_policy: createSnapshot({
      actionType: "create_support_case",
      segment: null,
    }),
    change_type: "created",
    changed_by: "operator@example.invalid",
    change_reason: null,
  });

  assert.equal(id, "42");
  assert.equal(calls[0].values[2], null);
}

{
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [{ id: 43 }] };
    },
  };
  const id = await insertActionAutonomyPolicyAudit(client, {
    action_type: "log_product_signal",
    segment: "linked_account",
    old_policy: createSnapshot({
      actionType: "log_product_signal",
      segment: "linked_account",
      tier: "bounded",
    }),
    new_policy: createSnapshot({
      actionType: "log_product_signal",
      segment: "linked_account",
      tier: "supervised",
    }),
    change_type: "auto_demoted",
    changed_by: "gate-test",
    change_reason: "autonomy_gate:f1_below_current_tier_floor",
    gate_evidence: {
      eval_run_id: "eval-1",
      f1: 0.5,
      unsafe_gate_rate: 0,
      sample_size: 25,
      gate_run_id: "gate-test",
    },
  });

  assert.equal(id, "43");
  assert.equal(calls[0].values[4], "auto_demoted");
  assert.equal(calls[0].values[7], "eval-1");
  assert.equal(calls[0].values[8], 0.5);
  assert.equal(calls[0].values[9], 0);
  assert.equal(calls[0].values[10], 25);
  assert.equal(calls[0].values[11], "gate-test");
}

{
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return {
        rows: [
          {
            id: "52",
            action_type: "create_csm_task",
            segment: "linked_account",
            old_policy: {
              ...createSnapshot({ confidenceFloor: "0.90" }),
              updated_at: "2026-06-27T12:00:00.000Z",
            },
            new_policy: {
              ...createSnapshot({ confidenceFloor: "0.80" }),
              updated_at: "2026-06-28T12:00:00.000Z",
            },
            change_type: "requested",
            changed_by: "operator@example.invalid",
            change_reason: "Synthetic policy review",
            created_at: "2026-06-28T12:01:00.000Z",
          },
          {
            id: "51",
            action_type: "create_support_case",
            segment: null,
            old_policy: null,
            new_policy: {
              ...createSnapshot({
                actionType: "create_support_case",
                segment: null,
              }),
              updated_at: "2026-06-27T12:00:00.000Z",
            },
            change_type: "seeded",
            changed_by: "seed",
            change_reason: null,
            created_at: new Date("2026-06-27T12:01:00.000Z"),
          },
        ],
      };
    },
  };
  const audits = await listActionAutonomyPolicyAudits(client, {
    actionType: "create_csm_task",
    segment: "linked_account",
    changeType: "requested",
    limit: 10,
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /ORDER BY created_at DESC, id DESC/);
  assert.deepEqual(calls[0].values, [
    "create_csm_task",
    "linked_account",
    "requested",
    10,
  ]);
  assert.equal(audits.length, 2);
  assert.equal(audits[0].id, "52");
  assert.equal(audits[0].change_type, "requested");
  assert.equal(audits[0].old_policy?.confidence_floor, 0.9);
  assert.equal(audits[0].new_policy.confidence_floor, 0.8);
  assert.ok(audits[0].old_policy?.updated_at instanceof Date);
  assert.ok(audits[0].new_policy.updated_at instanceof Date);
  assert.ok(audits[0].created_at instanceof Date);
  assert.equal(audits[1].old_policy, null);
  assert.equal(audits[1].segment, null);
}

{
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [] };
    },
  };

  await listActionAutonomyPolicyAudits(client, {
    segment: null,
    limit: 5,
  });

  assert.match(calls[0].sql, /segment IS NULL/);
  assert.deepEqual(calls[0].values, [5]);
}

console.log("PASS action autonomy policy audit repository");
