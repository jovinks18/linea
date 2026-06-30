import assert from "node:assert/strict";
import {
  listRecentAgentActionsForSimulation,
} from "../lib/agent/action-history.repository.ts";
import {
  simulatePolicyChangeRequestImpact,
  simulatePolicyPatchImpact,
} from "../lib/agent/autonomy-policy-simulation.ts";

function policy(overrides = {}) {
  return {
    action_type: "create_csm_task",
    segment: "linked_account",
    tier: "bounded",
    confidence_floor: 0.8,
    max_blast_radius: 1,
    requires_reversible: true,
    updated_by: "seed",
    updated_at: "2026-06-30T00:00:00.000Z",
    ...overrides,
  };
}

function actionRow(overrides = {}) {
  return {
    id: "40",
    case_id: "12",
    case_number: "LIN-0012",
    account_id: "2",
    action_type: "create_csm_task",
    status: "suggested",
    confidence: "0.85",
    metadata: {
      blast_radius: 1,
      reversible: true,
      segment: "linked_account",
    },
    created_at: "2026-06-30T01:00:00.000Z",
    ...overrides,
  };
}

{
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [actionRow()] };
    },
  };

  const rows = await listRecentAgentActionsForSimulation(client, {
    actionType: "create_csm_task",
    segment: "linked_account",
  });

  assert.equal(rows.length, 1);
  assert.match(calls[0].sql, /aa\.action_type = \$1/);
  assert.match(calls[0].sql, /aa\.metadata->>'segment' = \$2/);
  assert.match(calls[0].sql, /ORDER BY aa\.created_at DESC, aa\.id DESC/);
  assert.deepEqual(calls[0].values, [
    "create_csm_task",
    "linked_account",
    100,
  ]);
}

{
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [] };
    },
  };

  await listRecentAgentActionsForSimulation(client, {
    actionType: "create_csm_task",
    segment: null,
    limit: 25,
  });

  assert.doesNotMatch(calls[0].sql, /metadata->>'segment'/);
  assert.deepEqual(calls[0].values, ["create_csm_task", 25]);
}

{
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });

      if (sql.includes("FROM action_autonomy_policy_change_requests")) {
        return {
          rows: [
            {
              id: "9",
              action_type: "create_csm_task",
              segment: "linked_account",
              old_policy: policy(),
              proposed_policy: policy({ confidence_floor: 0.9 }),
              patch: { confidence_floor: 0.9 },
              status: "pending",
              requested_by: "operator",
              request_reason: "Raise confidence floor",
              reviewed_by: null,
              review_reason: null,
              reviewed_at: null,
              created_at: "2026-06-30T00:00:00.000Z",
              updated_at: "2026-06-30T00:00:00.000Z",
            },
          ],
        };
      }

      if (sql.includes("FROM agent_actions")) {
        return { rows: [actionRow({ status: "executed" })] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  const result = await simulatePolicyChangeRequestImpact(client, {
    requestId: "9",
  });

  assert.equal(result.request_id, "9");
  assert.equal(result.proposed_policy.confidence_floor, 0.9);
  assert.equal(result.impact.would_change_executed_to_suggested, 1);
  assert.equal(
    calls.some(({ sql }) => /\b(INSERT|UPDATE|DELETE)\b/.test(sql)),
    false
  );
}

{
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });

      if (sql.includes("FROM action_autonomy_policy")) {
        return { rows: [policy()] };
      }

      if (sql.includes("FROM agent_actions")) {
        return { rows: [actionRow()] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  const result = await simulatePolicyPatchImpact(client, {
    action_type: "create_csm_task",
    segment: "linked_account",
    patch: { confidence_floor: 0.9 },
  });

  assert.equal(result.proposed_policy.confidence_floor, 0.9);
  assert.equal(result.impact.would_remain_suggested, 1);
  assert.equal(
    calls.some(({ sql }) => /\b(INSERT|UPDATE|DELETE)\b/.test(sql)),
    false
  );
}

console.log("PASS autonomy policy impact services");
