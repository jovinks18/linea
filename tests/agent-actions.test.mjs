import assert from "node:assert/strict";
import {
  buildAgentActionAudit,
  buildFailedAgentActionAudit,
} from "../lib/agent/audit.ts";
import {
  buildAgentDecision,
  buildAgentEnvelope,
  buildPolicyDecision,
  createModelProposal,
} from "../lib/agent/decision.ts";
import { buildExecutionResult } from "../lib/agent/execution.ts";
import { insertAgentActionDurably } from "../lib/agent/repository.ts";
import {
  executePostSalesAction,
  PostSalesActionExecutionError,
} from "../lib/post-sales/execution-error.ts";
import { generateIntakeResponse } from "../lib/responses/router.ts";

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

function createDirective(actionType, execute, overrides = {}) {
  return {
    action_type: actionType,
    execute,
    status: execute ? "executed" : "suggested",
    tier: "bounded",
    confidence_floor: 0.8,
    max_blast_radius: 1,
    requires_reversible: actionType !== "update_account_health",
    blast_radius:
      actionType === "require_human_review" ||
      actionType === "detect_onboarding_blocker"
        ? 0
        : 1,
    blast_radius_scope:
      actionType === "require_human_review" ||
      actionType === "detect_onboarding_blocker"
        ? "none"
        : actionType === "create_support_case"
          ? "case"
          : "account",
    blast_radius_reason:
      actionType === "require_human_review" ||
      actionType === "detect_onboarding_blocker"
        ? "Classifies or routes work without mutating customer records."
        : actionType === "create_support_case"
          ? "Affects only the current support case."
          : "Affects one linked account.",
    reversible: actionType !== "update_account_health",
    breaker_tripped: false,
    breaker_reasons: [],
    breaker_keys: [],
    breaker_source: "none",
    segment: "linked_account",
    ...overrides,
  };
}

function createScenarioDirectives(policyDecision, accountId) {
  const segment =
    accountId === null ? "unknown_account" : "linked_account";

  return policyDecision.recommended_actions
    .filter((actionType) => actionType !== "create_support_case")
    .map((actionType) => {
    if (accountId !== null) {
      return createDirective(actionType, true, { segment });
    }

    if (actionType === "require_human_review") {
      return createDirective(actionType, false, {
        confidence_floor: 0.9,
        enqueue_review: true,
        reason: "out_of_bounds",
        segment,
      });
    }

    return createDirective(actionType, false, {
      tier: "supervised",
      confidence_floor: 0.9,
      enqueue_review: true,
      reason: "supervised",
      segment,
    });
    });
}

function buildScenario({
  message,
  accountId,
  onboardingBlockerDetected,
  actions,
  modelPlan,
  caseId,
  priority = "P1",
  intakeRunId = `intake-${caseId}`,
}) {
  const preliminaryExecutionResult = buildExecutionResult({
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
    executionResult: preliminaryExecutionResult,
    modelProposal,
  });
  const actionDirectives = createScenarioDirectives(
    policyDecision,
    accountId
  );
  const executionResult = buildExecutionResult({
    caseId,
    accountId,
    caseWasCreated: true,
    onboardingBlockerDetected,
    actions,
    actionDirectives,
  });
  const envelope = buildAgentEnvelope({
    modelProposal,
    policyDecision,
    actionDirectives,
    executionResult,
  });
  const agentDecision = buildAgentDecision({
    policyDecision: envelope.policy_decision,
    executionResult: envelope.execution_result,
  });
  const audit = buildAgentActionAudit({
    policyDecision: envelope.policy_decision,
    executionResult: envelope.execution_result,
    intakeRunId,
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
  "create_support_case",
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
assert.equal(
  new Set(knownBlocker.audit.map(({ action_type }) => action_type)).size,
  knownBlocker.audit.length
);
assert.equal(knownBlocker.audit[0].metadata.policy_exempt, true);
assert.equal(
  knownBlocker.audit[0].metadata.reason,
  "intake_capture_prerequisite"
);
assert.equal(knownBlocker.audit[0].metadata.case_resolution, "created");
assert.equal(knownBlocker.audit[0].metadata.tier, undefined);
assert.equal(knownBlocker.audit[0].metadata.breaker_tripped, undefined);
assert.equal(knownBlocker.audit[1].metadata.tier, "bounded");
assert.equal(knownBlocker.audit[1].metadata.segment, "linked_account");
assert.equal(knownBlocker.audit[5].metadata.reversible, false);
assert.equal(
  knownBlocker.audit[5].metadata.requires_reversible,
  false
);

{
  const breakerDirectives =
    knownBlocker.envelope.policy_decision.recommended_actions
      .filter((actionType) => actionType !== "create_support_case")
      .map(
      (actionType) =>
        createDirective(actionType, false, {
          breaker_tripped: true,
          breaker_reasons: ["Synthetic breaker"],
          breaker_keys: ["synthetic-breaker"],
          breaker_source: "manual",
          enqueue_review: true,
          reason: "out_of_bounds",
        })
    );
  const breakerExecution = buildExecutionResult({
    caseId: 104,
    accountId: 10,
    caseWasCreated: true,
    onboardingBlockerDetected: true,
    actions: createActions(),
    actionDirectives: breakerDirectives,
  });
  const breakerDecision = buildAgentDecision({
    policyDecision: knownBlocker.envelope.policy_decision,
    executionResult: breakerExecution,
  });

  assert.deepEqual(breakerDecision.executed_actions, [
    "create_support_case",
  ]);
  assert.equal(breakerDecision.requires_human_review, true);
  const breakerAudit = buildAgentActionAudit({
    policyDecision: knownBlocker.envelope.policy_decision,
    executionResult: breakerExecution,
    intakeRunId: "intake-breaker",
    now,
  });
  assert.deepEqual(breakerAudit[0].metadata, {
    intake_run_id: "intake-breaker",
    policy_exempt: true,
    reason: "intake_capture_prerequisite",
    case_resolution: "created",
  });
  assert.match(
    generateIntakeResponse({
      message:
        "Our API setup is still blocked and we are supposed to go live Friday.",
      onboardingBlockerDetected: true,
      hasLinkedAccount: true,
      automationBlockedByBreaker: true,
    }),
    /held by an active safety circuit breaker/
  );
}

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
assert.deepEqual(unknownBlocker.agentDecision.executed_actions, [
  "create_support_case",
]);
assert.deepEqual(
  unknownBlocker.audit.map(({ action_type, status }) => [action_type, status]),
  [
    ["create_support_case", "executed"],
    ["detect_onboarding_blocker", "suggested"],
    ["create_csm_task", "suggested"],
    ["log_product_signal", "suggested"],
    ["create_account_health_event", "suggested"],
    ["update_account_health", "suggested"],
    ["require_human_review", "suggested"],
  ]
);
assert.equal(unknownBlocker.audit[1].metadata.reason, "supervised");
assert.equal(unknownBlocker.audit[1].metadata.tier, "supervised");
assert.equal(unknownBlocker.audit[1].metadata.enqueue_review, true);
assert.equal(
  new Set(unknownBlocker.audit.map(({ action_type }) => action_type)).size,
  unknownBlocker.audit.length
);
assert.equal(
  unknownBlocker.audit.length,
  unknownBlocker.agentDecision.recommended_actions.length
);

const smartLock = buildScenario({
  caseId: 103,
  accountId: 10,
  onboardingBlockerDetected: false,
  actions: createActions(),
  message: "My smart lock is not responding after I changed the batteries.",
  modelPlan: createModelPlan("implementation_blocker"),
});

assert.equal(smartLock.agentDecision.classification, "support_question");
assert.deepEqual(smartLock.agentDecision.executed_actions, [
  "create_support_case",
]);
assert.deepEqual(smartLock.agentDecision.recommended_actions, [
  "create_support_case",
]);
assert.deepEqual(
  smartLock.audit.map(({ action_type, status }) => [action_type, status]),
  [["create_support_case", "executed"]]
);
assert.match(smartLock.agentDecision.reasoning_summary, /ignored/i);

const restoredSmartLockExecution = buildExecutionResult({
  caseId: 103,
  accountId: 10,
  caseWasCreated: false,
  onboardingBlockerDetected: false,
  actions: createActions(),
});
const restoredSmartLockAudit = buildAgentActionAudit({
  executionResult: restoredSmartLockExecution,
  policyDecision: smartLock.envelope.policy_decision,
  intakeRunId: "intake-restored-smart-lock",
  now,
});

assert.deepEqual(restoredSmartLockExecution.executed_actions, [
  "create_support_case",
]);
assert.equal(
  restoredSmartLockAudit[0].metadata.case_resolution,
  "restored"
);
assert.notEqual(
  smartLock.audit[0].metadata.intake_run_id,
  restoredSmartLockAudit[0].metadata.intake_run_id
);

for (const scenario of [knownBlocker, unknownBlocker, smartLock]) {
  const outcomeKeys = scenario.audit.map(
    (row) => `${row.metadata.intake_run_id}:${row.action_type}`
  );
  assert.equal(new Set(outcomeKeys).size, outcomeKeys.length);
}

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
assert.deepEqual(deterministicFallback.agentDecision.executed_actions, [
  "create_support_case",
]);

let simulatedPostSalesFailure;

try {
  await executePostSalesAction("create_csm_task", async () => {
    throw new Error("Simulated task insert failure");
  });
} catch (error) {
  simulatedPostSalesFailure = error;
}

assert.ok(
  simulatedPostSalesFailure instanceof PostSalesActionExecutionError
);
assert.equal(simulatedPostSalesFailure.actionType, "create_csm_task");

const failedAction = buildFailedAgentActionAudit({
  actionType: "create_csm_task",
  caseId: null,
  accountId: 10,
  policyDecision: knownBlocker.envelope.policy_decision,
  error: simulatedPostSalesFailure.originalError,
  intakeRunId: "intake-failed-action",
});
const transactionWrites = [failedAction];
const durableWrites = [];
const transactionClient = {
  async query(sql) {
    if (sql === "ROLLBACK") transactionWrites.length = 0;
    return { rows: [] };
  },
};
const durableDatabase = {
  async connect() {
    return {
      async query(_sql, values) {
        durableWrites.push({
          action_type: values[2],
          status: values[3],
          source: values[4],
          confidence: values[5],
          reasoning_summary: values[6],
          metadata: JSON.parse(values[7]),
        });
        return { rows: [{ id: "1" }] };
      },
      release() {},
    };
  },
};

await transactionClient.query("ROLLBACK");
await insertAgentActionDurably(durableDatabase, failedAction);

assert.equal(transactionWrites.length, 0);
assert.deepEqual(durableWrites, [
  {
    action_type: "create_csm_task",
    status: "failed",
    source: "hybrid",
    confidence: 0.9,
    reasoning_summary:
      knownBlocker.envelope.policy_decision.reasoning_summary,
    metadata: {
      intake_run_id: "intake-failed-action",
      reason: "Post-sales action failed",
      error: "Simulated task insert failure",
    },
  },
]);

console.log("PASS agent policy and execution envelope");
