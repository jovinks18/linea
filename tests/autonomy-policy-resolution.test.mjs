import assert from "node:assert/strict";
import {
  getAutonomySegment,
} from "../lib/agent/autonomy-policy.ts";
import {
  resolveActionAutonomyPolicies,
  resolveActionAutonomyPolicy,
} from "../lib/agent/autonomy-policy.repository.ts";

function createPolicyRow({
  actionType = "create_csm_task",
  segment = null,
  tier = "bounded",
} = {}) {
  return {
    action_type: actionType,
    segment,
    tier,
    confidence_floor: "0.90",
    max_blast_radius: 1,
    requires_reversible: true,
    updated_by: "test",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function createFakeClient(rows) {
  const calls = [];

  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });

      const [actionType, segment] = values;
      const expectsDefault = values.length === 1;
      const row = rows.find(
        (candidate) =>
          candidate.action_type === actionType &&
          (expectsDefault
            ? candidate.segment === null
            : candidate.segment === segment)
      );

      return { rows: row ? [row] : [] };
    },
  };
}

{
  const client = createFakeClient([
    createPolicyRow({ segment: null, tier: "supervised" }),
    createPolicyRow({ segment: "linked_account", tier: "bounded" }),
  ]);
  const policy = await resolveActionAutonomyPolicy(
    client,
    "create_csm_task",
    "linked_account"
  );

  assert.equal(policy.segment, "linked_account");
  assert.equal(policy.tier, "bounded");
  assert.equal(policy.confidence_floor, 0.9);
  assert.ok(policy.updated_at instanceof Date);
  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0].values, [
    "create_csm_task",
    "linked_account",
  ]);
}

{
  const client = createFakeClient([
    createPolicyRow({ segment: null, tier: "bounded" }),
  ]);
  const policy = await resolveActionAutonomyPolicy(
    client,
    "create_csm_task",
    "unknown_account"
  );

  assert.equal(policy.segment, null);
  assert.equal(policy.tier, "bounded");
  assert.equal(client.calls.length, 2);
  assert.deepEqual(client.calls[1].values, ["create_csm_task"]);
}

{
  const client = createFakeClient([]);
  const policy = await resolveActionAutonomyPolicy(
    client,
    "unknown_action",
    "linked_account"
  );

  assert.equal(policy.action_type, "unknown_action");
  assert.equal(policy.segment, "linked_account");
  assert.equal(policy.tier, "supervised");
  assert.equal(policy.updated_by, "restrictive_default");
}

{
  const client = createFakeClient([
    createPolicyRow({ segment: null, tier: "autonomous" }),
  ]);
  const policy = await resolveActionAutonomyPolicy(
    client,
    "create_csm_task",
    null
  );

  assert.equal(policy.tier, "autonomous");
  assert.equal(client.calls.length, 1);
  assert.deepEqual(client.calls[0].values, ["create_csm_task"]);
  assert.match(client.calls[0].sql, /segment IS NULL/);
}

{
  const client = createFakeClient([
    createPolicyRow({ segment: null, tier: "supervised" }),
  ]);
  const policy = await resolveActionAutonomyPolicy(
    client,
    "create_csm_task",
    "future_segment"
  );

  assert.equal(policy.tier, "supervised");
  assert.equal(policy.segment, null);
}

{
  const client = createFakeClient([
    createPolicyRow({
      actionType: "create_support_case",
      segment: null,
      tier: "bounded",
    }),
    createPolicyRow({
      actionType: "update_account_health",
      segment: null,
      tier: "supervised",
    }),
  ]);
  const policies = await resolveActionAutonomyPolicies(
    client,
    ["create_support_case", "update_account_health"],
    null
  );

  assert.equal(policies.get("create_support_case")?.tier, "bounded");
  assert.equal(policies.get("update_account_health")?.tier, "supervised");
}

assert.equal(getAutonomySegment({ accountId: 123 }), "linked_account");
assert.equal(getAutonomySegment({ accountId: null }), "unknown_account");

console.log("PASS action autonomy policy resolution");
