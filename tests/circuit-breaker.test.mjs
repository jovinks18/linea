import assert from "node:assert/strict";
import {
  getCircuitBreakerState,
} from "../lib/agent/circuit-breaker.ts";

function breakerRow(overrides = {}) {
  return {
    id: "1",
    breaker_key: "manual-test",
    scope: "global",
    status: "active",
    reason: "Synthetic operator stop",
    triggered_by: "synthetic.operator",
    triggered_at: "2026-06-30T00:00:00.000Z",
    cleared_by: null,
    cleared_at: null,
    metadata: {},
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:00:00.000Z",
    ...overrides,
  };
}

function createClient({
  breakers = [],
  failedActions = 0,
  rejectedRequests = 0,
} = {}) {
  const calls = [];

  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });

      if (sql.includes("FROM agent_circuit_breakers")) {
        const scopes = values[0] ?? [];
        return {
          rows: breakers.filter(
            (breaker) =>
              breaker.status === "active" &&
              scopes.includes(breaker.scope)
          ),
        };
      }

      if (sql.includes("FROM agent_actions")) {
        return { rows: [{ count: failedActions }] };
      }

      if (sql.includes("FROM action_autonomy_policy_change_requests")) {
        return { rows: [{ count: rejectedRequests }] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

{
  const state = await getCircuitBreakerState(createClient(), {
    actionType: "create_csm_task",
    segment: "linked_account",
  });

  assert.deepEqual(state, {
    tripped: false,
    reasons: [],
    breaker_keys: [],
    source: "none",
  });
}

{
  const state = await getCircuitBreakerState(
    createClient({ breakers: [breakerRow()] }),
    { actionType: "create_csm_task", segment: "linked_account" }
  );

  assert.equal(state.tripped, true);
  assert.equal(state.source, "manual");
  assert.deepEqual(state.breaker_keys, ["manual-test"]);
}

{
  const state = await getCircuitBreakerState(
    createClient({
      breakers: [
        breakerRow({
          breaker_key: "task-breaker",
          scope: "create_csm_task",
        }),
        breakerRow({
          id: "2",
          breaker_key: "segment-breaker",
          scope: "linked_account",
        }),
      ],
    }),
    { actionType: "create_csm_task", segment: "linked_account" }
  );

  assert.equal(state.tripped, true);
  assert.deepEqual(state.breaker_keys, [
    "task-breaker",
    "segment-breaker",
  ]);
}

{
  const state = await getCircuitBreakerState(
    createClient({
      breakers: [breakerRow({ status: "cleared" })],
    }),
    { actionType: "create_csm_task" }
  );

  assert.equal(state.tripped, false);
}

{
  const state = await getCircuitBreakerState(
    createClient({ failedActions: 3 }),
    { actionType: "create_csm_task", lookbackMinutes: 30 }
  );

  assert.equal(state.tripped, true);
  assert.equal(state.source, "system");
  assert.deepEqual(state.breaker_keys, ["failure_rate:create_csm_task"]);
  assert.match(state.reasons[0], /3 failed agent actions/);
}

{
  const state = await getCircuitBreakerState(
    createClient({ rejectedRequests: 3 }),
    { actionType: "create_csm_task" }
  );

  assert.equal(state.tripped, true);
  assert.equal(state.source, "system");
  assert.deepEqual(state.breaker_keys, ["policy_rejection_spike"]);
  assert.match(state.reasons[0], /3 policy changes were rejected/);
}

console.log("PASS agent circuit breaker evaluation");
