import type { AgentPlan } from "../models/types";

export type AgentClassification =
  | "support_question"
  | "implementation_blocker"
  | "product_feedback"
  | "unknown";

export type AgentRecommendedAction =
  | "create_support_case"
  | "create_csm_task"
  | "log_product_signal"
  | "update_account_health"
  | "require_human_review";

export type AgentDecisionSource = "deterministic" | "model" | "hybrid";

export type AgentDecision = {
  classification: AgentClassification;
  confidence: number;
  urgency?: "low" | "medium" | "high";
  product_area?: string | null;
  reasoning_summary: string;
  recommended_actions: AgentRecommendedAction[];
  executed_actions: string[];
  requires_human_review: boolean;
  source: AgentDecisionSource;
};

type PostSalesActionFlags = {
  onboarding_blocker_detected: boolean;
  task_created: boolean;
  product_signal_created: boolean;
  health_event_created: boolean;
  account_health_updated: boolean;
};

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

function getExecutedActions(actions: PostSalesActionFlags) {
  const executedActions: string[] = [];

  if (actions.onboarding_blocker_detected) {
    executedActions.push("detect_onboarding_blocker");
  }

  if (actions.task_created) {
    executedActions.push("create_csm_task");
  }

  if (actions.product_signal_created) {
    executedActions.push("log_product_signal");
  }

  if (actions.health_event_created) {
    executedActions.push("create_account_health_event");
  }

  if (actions.account_health_updated) {
    executedActions.push("update_account_health");
  }

  return executedActions;
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

function withModelPlan({
  baseDecision,
  hasLinkedAccount,
  modelPlan,
}: {
  baseDecision: AgentDecision;
  hasLinkedAccount: boolean;
  modelPlan: AgentPlan | null;
}): AgentDecision {
  if (!modelPlan) return baseDecision;

  const recommendedActions: AgentRecommendedAction[] =
    modelPlan.classification === "implementation_blocker" && !hasLinkedAccount
      ? ["create_support_case", "require_human_review"]
      : toRecommendedActions(modelPlan.recommended_actions);

  return {
    ...baseDecision,
    classification: modelPlan.classification,
    confidence: modelPlan.confidence,
    urgency: modelPlan.urgency,
    product_area: modelPlan.product_area ?? null,
    reasoning_summary:
      modelPlan.classification === "implementation_blocker" && !hasLinkedAccount
        ? "Customer reported an onboarding or go-live blocker, but no linked account was found."
        : modelPlan.reasoning_summary,
    recommended_actions:
      recommendedActions.length > 0
        ? recommendedActions
        : baseDecision.recommended_actions,
    requires_human_review:
      !hasLinkedAccount && modelPlan.classification === "implementation_blocker"
        ? true
        : modelPlan.requires_human_review,
    source: baseDecision.source === "deterministic" ? "hybrid" : "model",
  };
}

export function buildAgentDecision(input: {
  message: string;
  hasLinkedAccount: boolean;
  accountName?: string | null;
  intent: string;
  sentiment: string;
  priority: string;
  onboardingBlockerDetected: boolean;
  actions: PostSalesActionFlags;
  modelPlan?: AgentPlan | null;
}): AgentDecision {
  const executedActions = getExecutedActions(input.actions);
  let deterministicDecision: AgentDecision;

  if (input.onboardingBlockerDetected) {
    if (!input.hasLinkedAccount) {
      deterministicDecision = {
        classification: "implementation_blocker",
        confidence: 0.85,
        urgency: "high",
        product_area: "Implementation",
        reasoning_summary:
          "Customer reported an onboarding or go-live blocker, but no linked account was found.",
        recommended_actions: ["create_support_case", "require_human_review"],
        executed_actions: [],
        requires_human_review: true,
        source: "deterministic",
      };

      return withModelPlan({
        baseDecision: deterministicDecision,
        hasLinkedAccount: input.hasLinkedAccount,
        modelPlan: input.modelPlan ?? null,
      });
    }

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
      executed_actions: executedActions,
      requires_human_review: false,
      source: "deterministic",
    };

    return withModelPlan({
      baseDecision: deterministicDecision,
      hasLinkedAccount: input.hasLinkedAccount,
      modelPlan: input.modelPlan ?? null,
    });
  }

  if (includesAnyPhrase(input.message, deviceSupportPhrases)) {
    deterministicDecision = {
      classification: "support_question",
      confidence: 0.75,
      urgency: input.priority === "P1" ? "medium" : "low",
      product_area: "Device Support",
      reasoning_summary: input.hasLinkedAccount
        ? "Customer reported a device support issue."
        : "Customer reported a device support issue, but no linked account was found.",
      recommended_actions: ["create_support_case"],
      executed_actions: executedActions,
      requires_human_review: !input.hasLinkedAccount && input.priority === "P1",
      source: "deterministic",
    };

    return withModelPlan({
      baseDecision: deterministicDecision,
      hasLinkedAccount: input.hasLinkedAccount,
      modelPlan: input.modelPlan ?? null,
    });
  }

  if (includesAnyPhrase(input.message, productFeedbackPhrases)) {
    deterministicDecision = {
      classification: "product_feedback",
      confidence: 0.65,
      urgency: "medium",
      product_area: "Product",
      reasoning_summary: input.hasLinkedAccount
        ? "Customer message appears to include product feedback."
        : "Customer message appears to include product feedback, but no linked account was found.",
      recommended_actions: ["create_support_case"],
      executed_actions: executedActions,
      requires_human_review: !input.hasLinkedAccount && input.priority === "P1",
      source: "deterministic",
    };

    return withModelPlan({
      baseDecision: deterministicDecision,
      hasLinkedAccount: input.hasLinkedAccount,
      modelPlan: input.modelPlan ?? null,
    });
  }

  deterministicDecision = {
    classification:
      input.intent === "question" || input.intent === "request"
        ? "support_question"
        : "unknown",
    confidence: input.hasLinkedAccount ? 0.55 : 0.45,
    urgency: input.priority === "P1" ? "medium" : "low",
    product_area: null,
    reasoning_summary: input.hasLinkedAccount
      ? "Customer message was captured as a support case."
      : "Customer message was captured as a support case, but no linked account was found.",
    recommended_actions: ["create_support_case"],
    executed_actions: executedActions,
    requires_human_review: !input.hasLinkedAccount && input.priority === "P1",
    source: "deterministic",
  };

  return withModelPlan({
    baseDecision: deterministicDecision,
    hasLinkedAccount: input.hasLinkedAccount,
    modelPlan: input.modelPlan ?? null,
  });
}
