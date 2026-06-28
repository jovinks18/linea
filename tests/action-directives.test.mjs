import assert from "node:assert/strict";
import { buildActionDirectives } from "../lib/agent/action-directives.ts";

function createPolicyRow(actionType, tier, overrides = {}) {
  return {
    action_type: actionType,
    segment: null,
    tier,
    confidence_floor: "0.90",
    max_blast_radius: 1,
    requires_reversible: true,
    updated_by: "test",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createFakeClient(rows) {
  return {
    async query(_sql, values) {
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

function createPolicyDecision(recommendedActions, confidence = 0.9) {
  return {
    classification: "implementation_blocker",
    confidence,
    urgency: "high",
    product_area: "Implementation",
    reasoning_summary: "Test policy decision.",
    recommended_actions: recommendedActions,
    requires_human_review: false,
    source: "deterministic",
  };
}

const seedLikePolicies = [
  createPolicyRow("create_support_case", "bounded"),
  createPolicyRow("require_human_review", "bounded"),
  createPolicyRow("create_csm_task", "bounded"),
  createPolicyRow("log_product_signal", "bounded"),
  createPolicyRow("update_account_health", "supervised"),
];

{
  const directives = await buildActionDirectives({
    client: createFakeClient(seedLikePolicies),
    policyDecision: createPolicyDecision([
      "create_support_case",
      "create_csm_task",
      "log_product_signal",
      "update_account_health",
    ]),
    accountId: 123,
  });

  assert.deepEqual(
    directives.map(({ action_type, execute, status, enqueue_review }) => ({
      action_type,
      execute,
      status,
      enqueue_review,
    })),
    [
      {
        action_type: "create_support_case",
        execute: true,
        status: "executed",
        enqueue_review: undefined,
      },
      {
        action_type: "create_csm_task",
        execute: true,
        status: "executed",
        enqueue_review: undefined,
      },
      {
        action_type: "log_product_signal",
        execute: true,
        status: "executed",
        enqueue_review: undefined,
      },
      {
        action_type: "update_account_health",
        execute: false,
        status: "suggested",
        enqueue_review: true,
      },
    ]
  );
  assert.equal(directives[3].reason, "supervised");
  assert.equal(directives[3].tier, "supervised");
}

{
  const directives = await buildActionDirectives({
    client: createFakeClient(seedLikePolicies),
    policyDecision: createPolicyDecision([
      "create_support_case",
      "require_human_review",
    ]),
    accountId: null,
  });

  assert.deepEqual(
    directives.map(({ action_type, execute, reason }) => ({
      action_type,
      execute,
      reason,
    })),
    [
      {
        action_type: "create_support_case",
        execute: true,
        reason: undefined,
      },
      {
        action_type: "require_human_review",
        execute: true,
        reason: undefined,
      },
    ]
  );
}

{
  const [directive] = await buildActionDirectives({
    client: createFakeClient(seedLikePolicies),
    policyDecision: createPolicyDecision(["create_support_case"], 0.5),
    accountId: 123,
  });

  assert.equal(directive.execute, false);
  assert.equal(directive.status, "suggested");
  assert.equal(directive.reason, "out_of_bounds");
}

{
  const [directive] = await buildActionDirectives({
    client: createFakeClient(seedLikePolicies),
    policyDecision: createPolicyDecision(["update_account_health"]),
    accountId: 123,
  });

  assert.equal(directive.execute, false);
  assert.equal(directive.status, "suggested");
  assert.equal(directive.enqueue_review, true);
  assert.equal(directive.reason, "supervised");
}

{
  const [directive] = await buildActionDirectives({
    client: createFakeClient([]),
    policyDecision: createPolicyDecision(["unknown_action"]),
    accountId: 123,
  });

  assert.equal(directive.action_type, "unknown_action");
  assert.equal(directive.tier, "supervised");
  assert.equal(directive.execute, false);
  assert.equal(directive.status, "suggested");
  assert.equal(directive.reason, "supervised");
}

console.log("PASS action directive planning");
