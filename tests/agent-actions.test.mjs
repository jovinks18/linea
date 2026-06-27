import assert from "node:assert/strict";
import { buildAgentActionAudit } from "../lib/agent/audit.ts";
import {
  buildAgentDecision,
  buildAgentEnvelope,
  buildPolicyDecision,
  createModelProposal,
} from "../lib/agent/decision.ts";
import { buildExecutionResult } from "../lib/agent/execution.ts";

const now = new Date("2026-01-15T12:00:00.000Z");

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

function createModelPlan(classification) {
  return {
    classification,
    confidence: 0.62,
    urgency: classification === "implementation_blocker" ? "high" : "low",
    product_area:
      classification === "implementation_blocker"
        ? "Implementation"
        : "Support",
    reasoning_summary: `Model proposed ${classification}.`,
    recommended_actions:
      classification === "implementation_blocker"
        ? ["create_csm_task", "log_product_signal", "update_account_health"]
        : ["create_support_case"],
    requires_human_review: false,
  };
}

function buildScenario({
  message,
  accountId,
  onboardingBlockerDetected,
  actions,
  modelPlan,
  caseId,
  priority = "P1",
}) {
  const executionResult = buildExecutionResult({
    caseId,
    accountId,
    caseWasCreated: true,
    onboardingBlockerDetected,
    actions,
  });
  const modelProposal = createModelProposal(modelPlan);
  const policyDecision = buildPolicyDecision({
    message,
    intent: "question",
    priority,
    onboardingBlockerDetected,
    executionResult,
    modelProposal,
  });
  const envelope = buildAgentEnvelope({
    modelProposal,
    policyDecision,
    executionResult,
  });
  const agentDecision = buildAgentDecision({
    policyDecision: envelope.policy_decision,
    executionResult: envelope.execution_result,
  });
  const audit = buildAgentActionAudit({
    policyDecision: envelope.policy_decision,
    executionResult: envelope.execution_result,
    now,
  });

  return { envelope, agentDecision, audit };
}

const knownBlockerActions = createActions({
  onboarding_blocker_detected: true,
  task_created: true,
  product_signal_created: true,
  health_event_created: true,
  account_health_updated: true,
});
const knownBlocker = buildScenario({
  caseId: 101,
  accountId: 10,
  onboardingBlockerDetected: true,
  actions: knownBlockerActions,
  message:
    "Our API setup is still blocked and we are supposed to go live Friday.",
  modelPlan: createModelPlan("support_question"),
});
const expectedBlockerExecutions = [
  "detect_onboarding_blocker",
  "create_csm_task",
  "log_product_signal",
  "create_account_health_event",
  "update_account_health",
];

assert.equal(
  knownBlocker.envelope.model_proposal.classification,
  "support_question"
);
assert.equal(
  knownBlocker.envelope.policy_decision.classification,
  "implementation_blocker"
);
assert.equal(knownBlocker.agentDecision.classification, "implementation_blocker");
assert.deepEqual(
  knownBlocker.agentDecision.executed_actions,
  expectedBlockerExecutions
);
assert.match(knownBlocker.agentDecision.reasoning_summary, /ignored/i);
assert.deepEqual(
  knownBlocker.audit.map(({ action_type, status }) => [action_type, status]),
  expectedBlockerExecutions.map((action) => [action, "executed"])
);

const unknownBlocker = buildScenario({
  caseId: 102,
  accountId: null,
  onboardingBlockerDetected: true,
  actions: createActions(),
  message:
    "Our API setup is still blocked and we are supposed to go live Friday.",
  modelPlan: createModelPlan("support_question"),
});

assert.equal(unknownBlocker.agentDecision.classification, "implementation_blocker");
assert.equal(unknownBlocker.agentDecision.requires_human_review, true);
assert.deepEqual(unknownBlocker.agentDecision.executed_actions, []);
assert.deepEqual(
  unknownBlocker.audit.map(({ action_type, status }) => [action_type, status]),
  [
    ["create_support_case", "executed"],
    ["require_human_review", "suggested"],
    ["create_csm_task", "skipped"],
    ["log_product_signal", "skipped"],
    ["update_account_health", "skipped"],
  ]
);
assert.equal(unknownBlocker.audit[2].metadata.reason, "No linked account");

const smartLock = buildScenario({
  caseId: 103,
  accountId: 10,
  onboardingBlockerDetected: false,
  actions: createActions(),
  message: "My smart lock is not responding after I changed the batteries.",
  modelPlan: createModelPlan("implementation_blocker"),
});

assert.equal(smartLock.agentDecision.classification, "support_question");
assert.deepEqual(smartLock.agentDecision.executed_actions, []);
assert.deepEqual(smartLock.agentDecision.recommended_actions, [
  "create_support_case",
]);
assert.deepEqual(
  smartLock.audit.map(({ action_type, status }) => [action_type, status]),
  [["create_support_case", "executed"]]
);
assert.match(smartLock.agentDecision.reasoning_summary, /ignored/i);

const agreeingModel = buildScenario({
  caseId: 104,
  accountId: 10,
  onboardingBlockerDetected: false,
  actions: createActions(),
  message: "My smart lock needs help after a battery change.",
  modelPlan: createModelPlan("support_question"),
});

assert.equal(agreeingModel.agentDecision.source, "hybrid");
assert.equal(agreeingModel.agentDecision.confidence, 0.75);
assert.match(agreeingModel.agentDecision.reasoning_summary, /Model assessment:/);

const deterministicFallback = buildScenario({
  caseId: 105,
  accountId: 10,
  onboardingBlockerDetected: false,
  actions: createActions(),
  message: "Can you help me with setup?",
  modelPlan: null,
  priority: "P2",
});

assert.equal(deterministicFallback.envelope.model_proposal, null);
assert.equal(deterministicFallback.agentDecision.source, "deterministic");
assert.equal(deterministicFallback.agentDecision.classification, "support_question");
assert.deepEqual(deterministicFallback.agentDecision.executed_actions, []);

console.log("PASS agent policy and execution envelope");
