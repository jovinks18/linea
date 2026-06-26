import assert from "node:assert/strict";
import { buildAgentActionAudit } from "../lib/agent/audit.ts";

const now = new Date("2026-01-15T12:00:00.000Z");

function createDecision(overrides = {}) {
  return {
    classification: "support_question",
    confidence: 0.75,
    reasoning_summary: "Customer reported a device support issue.",
    recommended_actions: ["create_support_case"],
    executed_actions: [],
    requires_human_review: false,
    source: "deterministic",
    ...overrides,
  };
}

function createActions(overrides = {}) {
  return {
    onboarding_blocker_detected: false,
    task_created: false,
    product_signal_created: false,
    health_event_created: false,
    account_health_updated: false,
    ...overrides,
  };
}

const knownBlocker = buildAgentActionAudit({
  caseId: 101,
  accountId: 10,
  caseWasCreated: true,
  onboardingBlockerDetected: true,
  actions: createActions({
    onboarding_blocker_detected: true,
    task_created: true,
    product_signal_created: true,
    health_event_created: true,
    account_health_updated: true,
  }),
  decision: createDecision({
    classification: "implementation_blocker",
    confidence: 0.9,
    reasoning_summary:
      "Customer reported an onboarding or go-live blocker for a linked account.",
    recommended_actions: [
      "create_csm_task",
      "log_product_signal",
      "update_account_health",
    ],
  }),
  now,
});

assert.deepEqual(
  knownBlocker.map(({ action_type, status }) => [action_type, status]),
  [
    ["detect_onboarding_blocker", "executed"],
    ["create_csm_task", "executed"],
    ["log_product_signal", "executed"],
    ["create_account_health_event", "executed"],
    ["update_account_health", "executed"],
  ]
);
assert.ok(knownBlocker.every((action) => action.executed_at === now));

const unknownBlocker = buildAgentActionAudit({
  caseId: 102,
  accountId: null,
  caseWasCreated: true,
  onboardingBlockerDetected: true,
  actions: createActions(),
  decision: createDecision({
    classification: "implementation_blocker",
    confidence: 0.85,
    reasoning_summary:
      "Customer reported an onboarding or go-live blocker, but no linked account was found.",
    recommended_actions: ["create_support_case", "require_human_review"],
    requires_human_review: true,
  }),
  now,
});

assert.deepEqual(
  unknownBlocker.map(({ action_type, status }) => [action_type, status]),
  [
    ["create_support_case", "executed"],
    ["require_human_review", "suggested"],
    ["create_csm_task", "skipped"],
    ["log_product_signal", "skipped"],
    ["update_account_health", "skipped"],
  ]
);
assert.equal(unknownBlocker[2].metadata.reason, "No linked account");

const smartLock = buildAgentActionAudit({
  caseId: 103,
  accountId: 10,
  caseWasCreated: true,
  onboardingBlockerDetected: false,
  actions: createActions(),
  decision: createDecision({
    confidence: Number.NaN,
    source: "untrusted",
    recommended_actions: ["create_support_case", "log_product_signal"],
  }),
  now,
});

assert.deepEqual(
  smartLock.map(({ action_type, status }) => [action_type, status]),
  [["create_support_case", "executed"]]
);
assert.equal(smartLock[0].confidence, null);
assert.equal(smartLock[0].source, "deterministic");

const missingDecisionContext = buildAgentActionAudit({
  caseId: 104,
  accountId: 10,
  caseWasCreated: true,
  onboardingBlockerDetected: false,
  actions: createActions(),
  decision: {},
  now,
});

assert.equal(missingDecisionContext[0].confidence, null);
assert.equal(missingDecisionContext[0].source, "deterministic");

console.log("PASS agent action audit policy");
