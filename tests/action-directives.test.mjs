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
  createPolicyRow("create_support_case", "bounded", {
    segment: "linked_account",
    confidence_floor: "0.70",
  }),
  createPolicyRow("detect_onboarding_blocker", "bounded", {
    segment: "linked_account",
    confidence_floor: "0.80",
  }),
  createPolicyRow("create_csm_task", "bounded", {
    segment: "linked_account",
    confidence_floor: "0.80",
  }),
  createPolicyRow("log_product_signal", "bounded", {
    segment: "linked_account",
    confidence_floor: "0.80",
  }),
  createPolicyRow("create_account_health_event", "bounded", {
    segment: "linked_account",
    confidence_floor: "0.80",
  }),
  createPolicyRow("update_account_health", "bounded", {
    segment: "linked_account",
    confidence_floor: "0.80",
    requires_reversible: false,
  }),
  createPolicyRow("create_support_case", "bounded", {
    segment: "unknown_account",
    confidence_floor: "0.80",
  }),
  createPolicyRow("detect_onboarding_blocker", "supervised", {
    segment: "unknown_account",
  }),
  createPolicyRow("create_csm_task", "supervised", {
    segment: "unknown_account",
  }),
  createPolicyRow("log_product_signal", "supervised", {
    segment: "unknown_account",
  }),
  createPolicyRow("create_account_health_event", "supervised", {
    segment: "unknown_account",
  }),
  createPolicyRow("update_account_health", "supervised", {
    segment: "unknown_account",
  }),
  createPolicyRow("require_human_review", "bounded", {
    segment: "unknown_account",
  }),
];

{
  const directives = await buildActionDirectives({
    client: createFakeClient(seedLikePolicies),
    policyDecision: createPolicyDecision([
      "create_support_case",
      "detect_onboarding_blocker",
      "create_csm_task",
      "log_product_signal",
      "create_account_health_event",
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
        action_type: "detect_onboarding_blocker",
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
        action_type: "create_account_health_event",
        execute: true,
        status: "executed",
        enqueue_review: undefined,
      },
      {
        action_type: "update_account_health",
        execute: true,
        status: "executed",
        enqueue_review: undefined,
      },
    ]
  );
  assert.equal(directives[5].requires_reversible, false);
}

{
  const directives = await buildActionDirectives({
    client: createFakeClient(seedLikePolicies),
    policyDecision: createPolicyDecision(
      [
        "create_support_case",
        "detect_onboarding_blocker",
        "create_csm_task",
        "log_product_signal",
        "create_account_health_event",
        "update_account_health",
        "require_human_review",
      ],
      0.85
    ),
    accountId: null,
  });

  assert.deepEqual(
    directives.map(({ action_type, execute, reason, tier }) => ({
      action_type,
      execute,
      reason,
      tier,
    })),
    [
      {
        action_type: "create_support_case",
        execute: true,
        reason: undefined,
        tier: "bounded",
      },
      {
        action_type: "detect_onboarding_blocker",
        execute: false,
        reason: "supervised",
        tier: "supervised",
      },
      {
        action_type: "create_csm_task",
        execute: false,
        reason: "supervised",
        tier: "supervised",
      },
      {
        action_type: "log_product_signal",
        execute: false,
        reason: "supervised",
        tier: "supervised",
      },
      {
        action_type: "create_account_health_event",
        execute: false,
        reason: "supervised",
        tier: "supervised",
      },
      {
        action_type: "update_account_health",
        execute: false,
        reason: "supervised",
        tier: "supervised",
      },
      {
        action_type: "require_human_review",
        execute: false,
        reason: "out_of_bounds",
        tier: "bounded",
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
    client: createFakeClient([
      createPolicyRow("update_account_health", "supervised", {
        segment: "linked_account",
      }),
    ]),
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
