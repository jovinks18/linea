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
  | "route_to_human";

export type AgentDecision = {
  classification: AgentClassification;
  confidence: number;
  reasoning_summary: string;
  recommended_actions: AgentRecommendedAction[];
  executed_actions: string[];
  requires_human_review: boolean;
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

export function buildAgentDecision(input: {
  message: string;
  hasLinkedAccount: boolean;
  accountName?: string | null;
  intent: string;
  sentiment: string;
  priority: string;
  onboardingBlockerDetected: boolean;
  actions: PostSalesActionFlags;
}): AgentDecision {
  const executedActions = getExecutedActions(input.actions);

  if (input.onboardingBlockerDetected) {
    if (!input.hasLinkedAccount) {
      return {
        classification: "implementation_blocker",
        confidence: 0.85,
        reasoning_summary:
          "Customer reported an onboarding or go-live blocker, but no linked account was found.",
        recommended_actions: ["create_support_case"],
        executed_actions: [],
        requires_human_review: true,
      };
    }

    return {
      classification: "implementation_blocker",
      confidence: 0.9,
      reasoning_summary:
        "Customer reported an onboarding or go-live blocker for a linked account.",
      recommended_actions: [
        "create_csm_task",
        "log_product_signal",
        "update_account_health",
      ],
      executed_actions: executedActions,
      requires_human_review: false,
    };
  }

  if (includesAnyPhrase(input.message, deviceSupportPhrases)) {
    return {
      classification: "support_question",
      confidence: 0.75,
      reasoning_summary: input.hasLinkedAccount
        ? "Customer reported a device support issue."
        : "Customer reported a device support issue, but no linked account was found.",
      recommended_actions: ["create_support_case"],
      executed_actions: executedActions,
      requires_human_review: !input.hasLinkedAccount && input.priority === "P1",
    };
  }

  if (includesAnyPhrase(input.message, productFeedbackPhrases)) {
    return {
      classification: "product_feedback",
      confidence: 0.65,
      reasoning_summary: input.hasLinkedAccount
        ? "Customer message appears to include product feedback."
        : "Customer message appears to include product feedback, but no linked account was found.",
      recommended_actions: ["create_support_case"],
      executed_actions: executedActions,
      requires_human_review: !input.hasLinkedAccount && input.priority === "P1",
    };
  }

  return {
    classification:
      input.intent === "question" || input.intent === "request"
        ? "support_question"
        : "unknown",
    confidence: input.hasLinkedAccount ? 0.55 : 0.45,
    reasoning_summary: input.hasLinkedAccount
      ? "Customer message was captured as a support case."
      : "Customer message was captured as a support case, but no linked account was found.",
    recommended_actions: ["create_support_case"],
    executed_actions: executedActions,
    requires_human_review: !input.hasLinkedAccount && input.priority === "P1",
  };
}
