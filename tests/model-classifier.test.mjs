import assert from "node:assert/strict";
import { buildActionDirectives } from "../lib/agent/action-directives.ts";
import { buildPolicyDecision } from "../lib/agent/decision.ts";
import { buildExecutionResult } from "../lib/agent/execution.ts";
import { createEmptyPostSalesActions } from "../lib/post-sales/automation.ts";
import { classifyWithModel } from "../lib/triage/model-classifier.ts";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;

function restore() {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
}

function configureGroq() {
  process.env = {
    ...originalEnv,
    MODEL_PROVIDER: "groq",
    GROQ_API_KEY: "test-groq-key",
    GROQ_MODEL: "test-groq-model",
  };
}

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

function createPolicyRow(actionType, segment, tier, overrides = {}) {
  return {
    action_type: actionType,
    segment,
    tier,
    confidence_floor: overrides.confidence_floor ?? "0.80",
    max_blast_radius: overrides.max_blast_radius ?? 1,
    requires_reversible: overrides.requires_reversible ?? true,
    updated_by: "test",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function createFakePolicyClient(rows) {
  return {
    async query(sql, values) {
      assert.match(sql, /action_autonomy_policy/);

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

try {
  {
    configureGroq();
    globalThis.fetch = async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "question",
                sentiment: "negative",
                priority: "P1",
                classification: "implementation_blocker",
              }),
            },
          },
        ],
      });

    const result = await classifyWithModel({
      message:
        "We can't move forward until SSO roles are approved for training.",
      account: { name: "Acme Clinics", health_status: "at_risk" },
    });

    assert.deepEqual(result, {
      intent: "question",
      sentiment: "negative",
      priority: "P1",
      classification: "implementation_blocker",
    });
  }

  {
    configureGroq();
    globalThis.fetch = async () =>
      jsonResponse({
        choices: [{ message: { content: "not json" } }],
      });

    assert.equal(
      await classifyWithModel({ message: "Can you help?", account: null }),
      null
    );
  }

  {
    configureGroq();
    let warnings = 0;
    console.warn = () => {
      warnings += 1;
    };
    globalThis.fetch = async () => {
      throw new Error("rate limit");
    };

    assert.equal(
      await classifyWithModel({ message: "Can you help?", account: null }),
      null
    );
    assert.equal(warnings, 0);
  }

  {
    const modelClassification = {
      intent: "question",
      sentiment: "negative",
      priority: "P1",
      classification: "implementation_blocker",
    };
    const executionResult = buildExecutionResult({
      caseId: 101,
      accountId: 2,
      caseWasCreated: true,
      onboardingBlockerDetected: false,
      actions: createEmptyPostSalesActions(),
    });
    const policyDecision = buildPolicyDecision({
      message:
        "We can't move forward until SSO roles are approved for training.",
      intent: modelClassification.intent,
      priority: modelClassification.priority,
      onboardingBlockerDetected: false,
      executionResult,
      modelProposal: null,
      modelClassification,
      accountHealthStatus: "healthy",
    });

    assert.equal(policyDecision.classification, "implementation_blocker");
    assert.equal(policyDecision.requires_human_review, true);
    assert.ok(
      policyDecision.recommended_actions.includes("require_human_review")
    );

    const directives = await buildActionDirectives({
      client: createFakePolicyClient([
        createPolicyRow("detect_onboarding_blocker", "linked_account", "bounded"),
        createPolicyRow("create_csm_task", "linked_account", "bounded"),
        createPolicyRow("log_product_signal", "linked_account", "bounded"),
        createPolicyRow(
          "create_account_health_event",
          "linked_account",
          "bounded"
        ),
        createPolicyRow("update_account_health", "linked_account", "supervised"),
      ]),
      policyDecision,
      accountId: 2,
      caseId: 101,
      affectedAccountIds: [2],
      affectedCustomerIds: [2],
    });

    const updateHealth = directives.find(
      (directive) => directive.action_type === "update_account_health"
    );
    const humanReview = directives.find(
      (directive) => directive.action_type === "require_human_review"
    );

    assert.equal(updateHealth?.status, "suggested");
    assert.equal(updateHealth?.execute, false);
    assert.equal(updateHealth?.tier, "supervised");
    assert.equal(humanReview?.policy_exempt, true);
    assert.equal(humanReview?.enqueue_review, true);
  }

  console.log("PASS model classifier fallback and policy routing");
} finally {
  restore();
}
