import type { AgentPlan } from "../models/types";
import type {
  AgentDecision,
  AgentEnvelope,
  AgentRecommendedAction,
  AgentUrgency,
  ExecutionResult,
  ModelProposal,
  PolicyDecision,
} from "./types";

export type {
  AgentClassification,
  AgentDecision,
  AgentDecisionSource,
  AgentRecommendedAction,
  AgentUrgency,
  ExecutionResult,
  ModelProposal,
  PolicyDecision,
} from "./types";

const deviceSupportPhrases = [
  "smart lock",
  "lock",
  "battery",
  "batteries",
  "not responding",
  "does not respond",
  "doesn't respond",
];

const productFeedbackPhrases = [
  "feature request",
  "bug",
  "docs",
  "documentation",
  "missing feature",
  "would be helpful",
];

function includesAnyPhrase(message: string, phrases: string[]) {
  const lower = message.toLowerCase();

  return phrases.some((phrase) => lower.includes(phrase));
}

function toRecommendedActions(actions: string[]): AgentRecommendedAction[] {
  const allowedActions: AgentRecommendedAction[] = [
    "create_support_case",
    "create_csm_task",
    "log_product_signal",
    "update_account_health",
    "require_human_review",
  ];

  return actions.filter((action): action is AgentRecommendedAction =>
    allowedActions.includes(action as AgentRecommendedAction)
  );
}

export function createModelProposal(
  modelPlan: AgentPlan | null
): ModelProposal | null {
  if (!modelPlan) return null;

  return {
    classification: modelPlan.classification,
    confidence: modelPlan.confidence,
    urgency: modelPlan.urgency,
    product_area: modelPlan.product_area ?? null,
    reasoning_summary: modelPlan.reasoning_summary,
    recommended_actions: toRecommendedActions(modelPlan.recommended_actions),
    requires_human_review: modelPlan.requires_human_review,
    source: "model",
  };
}

function maxUrgency(
  policyUrgency: AgentUrgency,
  proposalUrgency: AgentUrgency
): AgentUrgency {
  const rank: Record<AgentUrgency, number> = {
    low: 0,
    medium: 1,
    high: 2,
  };

  return rank[proposalUrgency] > rank[policyUrgency]
    ? proposalUrgency
    : policyUrgency;
}

function applyModelProposal(
  policyDecision: PolicyDecision,
  modelProposal: ModelProposal | null
): PolicyDecision {
  if (!modelProposal) return policyDecision;

  if (modelProposal.classification !== policyDecision.classification) {
    return {
      ...policyDecision,
      reasoning_summary: `${policyDecision.reasoning_summary} Model proposal was ignored because it conflicted with deterministic policy facts.`,
      source: "hybrid",
    };
  }

  return {
    ...policyDecision,
    urgency: maxUrgency(policyDecision.urgency, modelProposal.urgency),
    product_area: policyDecision.product_area ?? modelProposal.product_area,
    reasoning_summary: `${policyDecision.reasoning_summary} Model assessment: ${modelProposal.reasoning_summary}`,
    source: "hybrid",
  };
}

export function buildPolicyDecision(input: {
  message: string;
  intent: string;
  priority: string;
  onboardingBlockerDetected: boolean;
  executionResult: ExecutionResult;
  modelProposal: ModelProposal | null;
}): PolicyDecision {
  const blockerFact =
    input.onboardingBlockerDetected ||
    input.executionResult.post_sales_actions.onboarding_blocker_detected;
  const hasLinkedAccount = input.executionResult.account_id !== null;
  let deterministicDecision: PolicyDecision;

  if (blockerFact) {
    if (!hasLinkedAccount) {
      deterministicDecision = {
        classification: "implementation_blocker",
        confidence: 0.85,
        urgency: "high",
        product_area: "Implementation",
        reasoning_summary:
          "Customer reported an onboarding or go-live blocker, but no linked account was found.",
        recommended_actions: ["create_support_case", "require_human_review"],
        requires_human_review: true,
        source: "deterministic",
      };
    } else {
      deterministicDecision = {
        classification: "implementation_blocker",
        confidence: 0.9,
        urgency: "high",
        product_area: "Implementation",
        reasoning_summary:
          "Customer reported an onboarding or go-live blocker for a linked account.",
        recommended_actions: [
          "create_csm_task",
          "log_product_signal",
          "update_account_health",
        ],
        requires_human_review: false,
        source: "deterministic",
      };
    }
  } else if (includesAnyPhrase(input.message, deviceSupportPhrases)) {
    deterministicDecision = {
      classification: "support_question",
      confidence: 0.75,
      urgency: input.priority === "P1" ? "medium" : "low",
      product_area: "Device Support",
      reasoning_summary: hasLinkedAccount
        ? "Customer reported a device support issue."
        : "Customer reported a device support issue, but no linked account was found.",
      recommended_actions: ["create_support_case"],
      requires_human_review: !hasLinkedAccount && input.priority === "P1",
      source: "deterministic",
    };
  } else if (includesAnyPhrase(input.message, productFeedbackPhrases)) {
    deterministicDecision = {
      classification: "product_feedback",
      confidence: 0.65,
      urgency: "medium",
      product_area: "Product",
      reasoning_summary: hasLinkedAccount
        ? "Customer message appears to include product feedback."
        : "Customer message appears to include product feedback, but no linked account was found.",
      recommended_actions: ["create_support_case"],
      requires_human_review: !hasLinkedAccount && input.priority === "P1",
      source: "deterministic",
    };
  } else {
    deterministicDecision = {
      classification:
        input.intent === "question" || input.intent === "request"
          ? "support_question"
          : "unknown",
      confidence: hasLinkedAccount ? 0.55 : 0.45,
      urgency: input.priority === "P1" ? "medium" : "low",
      product_area: null,
      reasoning_summary: hasLinkedAccount
        ? "Customer message was captured as a support case."
        : "Customer message was captured as a support case, but no linked account was found.",
      recommended_actions: ["create_support_case"],
      requires_human_review: !hasLinkedAccount && input.priority === "P1",
      source: "deterministic",
    };
  }

  return applyModelProposal(deterministicDecision, input.modelProposal);
}

export function buildAgentDecision({
  policyDecision,
  executionResult,
}: {
  policyDecision: PolicyDecision;
  executionResult: ExecutionResult;
}): AgentDecision {
  return {
    ...policyDecision,
    executed_actions: executionResult.executed_actions,
  };
}

export function buildAgentEnvelope({
  modelProposal,
  policyDecision,
  executionResult,
}: {
  modelProposal: ModelProposal | null;
  policyDecision: PolicyDecision;
  executionResult: ExecutionResult;
}): AgentEnvelope {
  return {
    model_proposal: modelProposal,
    policy_decision: policyDecision,
    execution_result: executionResult,
  };
}
