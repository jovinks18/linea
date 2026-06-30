import assert from "node:assert/strict";
import {
  ActionAutonomyPolicyNotFoundError,
  ActionAutonomyPolicyValidationError,
  updateActionAutonomyPolicyWithAudit,
} from "../lib/agent/autonomy-policy.repository.ts";

function createPolicyRow(overrides = {}) {
  return {
    action_type: "create_csm_task",
    segment: "linked_account",
    tier: "bounded",
    confidence_floor: "0.80",
    max_blast_radius: 1,
    requires_reversible: true,
    updated_by: "seed",
    updated_at: "2026-06-28T00:00:00.000Z",
    ...overrides,
  };
}

function createFakeClient({ existingRow = createPolicyRow() } = {}) {
  const calls = [];

  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });

      if (sql.includes("SELECT") && sql.includes("FOR UPDATE")) {
        return { rows: existingRow ? [existingRow] : [] };
      }

      if (sql.includes("UPDATE action_autonomy_policy")) {
        return {
          rows: [
            createPolicyRow({
              tier: values[2],
              confidence_floor: values[3],
              max_blast_radius: values[4],
              requires_reversible: values[5],
              updated_by: values[6],
              updated_at: "2026-06-29T00:00:00.000Z",
            }),
          ],
        };
      }

      if (sql.includes("INSERT INTO action_autonomy_policy_audit")) {
        return { rows: [{ id: "88" }] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

{
  const client = createFakeClient();
  const updated = await updateActionAutonomyPolicyWithAudit(client, {
    action_type: "create_csm_task",
    segment: "linked_account",
    patch: { confidence_floor: 0.85 },
    changed_by: "operator",
    change_reason: "Test bounded policy edit",
  });

  assert.equal(client.calls.length, 3);
  assert.match(client.calls[0].sql, /FOR UPDATE/);
  assert.deepEqual(client.calls[0].values, [
    "create_csm_task",
    "linked_account",
  ]);
  assert.match(client.calls[1].sql, /UPDATE action_autonomy_policy/);
  assert.match(
    client.calls[2].sql,
    /INSERT INTO action_autonomy_policy_audit/
  );
  assert.equal(updated.confidence_floor, 0.85);
  assert.equal(updated.updated_by, "operator");

  const oldPolicy = JSON.parse(client.calls[2].values[2]);
  const newPolicy = JSON.parse(client.calls[2].values[3]);
  assert.equal(oldPolicy.confidence_floor, 0.8);
  assert.equal(newPolicy.confidence_floor, 0.85);
  assert.equal(client.calls[2].values[4], "updated");
  assert.equal(client.calls[2].values[5], "operator");
  assert.equal(client.calls[2].values[6], "Test bounded policy edit");
}

{
  const client = createFakeClient();

  await assert.rejects(
    updateActionAutonomyPolicyWithAudit(client, {
      action_type: "create_csm_task",
      segment: "linked_account",
      patch: { confidence_floor: 0.5 },
      changed_by: "operator",
      change_reason: "Unsafe test",
    }),
    ActionAutonomyPolicyValidationError
  );

  assert.equal(client.calls.length, 1);
  assert.doesNotMatch(
    client.calls[0].sql,
    /UPDATE action_autonomy_policy|INSERT INTO/
  );
}

{
  const client = createFakeClient({ existingRow: null });

  await assert.rejects(
    updateActionAutonomyPolicyWithAudit(client, {
      action_type: "missing_action",
      segment: null,
      patch: { confidence_floor: 0.85 },
      changed_by: "operator",
      change_reason: "Missing row test",
    }),
    ActionAutonomyPolicyNotFoundError
  );

  assert.equal(client.calls.length, 1);
  assert.match(client.calls[0].sql, /segment IS NULL/);
}

console.log("PASS action autonomy policy edit repository");
