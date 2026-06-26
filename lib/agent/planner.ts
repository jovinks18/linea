import { callConfiguredModel } from "../models/provider";
import type {
  AgentPlan,
  AgentPlanClassification,
  AgentPlanUrgency,
} from "../models/types";

const allowedClassifications: AgentPlanClassification[] = [
  "support_question",
  "implementation_blocker",
  "product_feedback",
  "unknown",
];

const allowedUrgencies: AgentPlanUrgency[] = ["low", "medium", "high"];

const allowedActions = [
  "create_support_case",
  "create_csm_task",
  "log_product_signal",
  "update_account_health",
  "require_human_review",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampConfidence(value: unknown) {
  const confidence = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(confidence)) return 0;

  return Math.max(0, Math.min(1, confidence));
}

function validatePlan(value: unknown): AgentPlan | null {
  if (!isRecord(value)) return null;

  const classification = value.classification;
  const urgency = value.urgency;
  const reasoningSummary = value.reasoning_summary;
  const recommendedActions = value.recommended_actions;

  if (
    typeof classification !== "string" ||
    !allowedClassifications.includes(classification as AgentPlanClassification)
  ) {
    return null;
  }

  if (
    typeof urgency !== "string" ||
    !allowedUrgencies.includes(urgency as AgentPlanUrgency)
  ) {
    return null;
  }

  if (typeof reasoningSummary !== "string" || !reasoningSummary.trim()) {
    return null;
  }

  if (!Array.isArray(recommendedActions)) return null;

  const safeActions = recommendedActions.filter(
    (action): action is string =>
      typeof action === "string" && allowedActions.includes(action)
  );

  return {
    classification: classification as AgentPlanClassification,
    confidence: clampConfidence(value.confidence),
    urgency: urgency as AgentPlanUrgency,
    product_area:
      typeof value.product_area === "string" ? value.product_area : null,
    reasoning_summary: reasoningSummary,
    recommended_actions: safeActions,
    requires_human_review: value.requires_human_review === true,
  };
}

function buildPlannerPrompt(input: {
  message: string;
  account?: {
    name?: string | null;
    industry?: string | null;
    plan?: string | null;
    stage?: string | null;
    health_status?: string | null;
  } | null;
}) {
  return [
    {
      role: "system" as const,
      content:
        "You are Linea's post-sales planning model. Return JSON only. Do not claim any action was executed. Do not call tools or mutate data. Classify the customer message, identify urgency, identify product_area if any, provide a short user-safe reasoning_summary, recommend actions only from: create_support_case, create_csm_task, log_product_signal, update_account_health, require_human_review.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        message: input.message,
        account: input.account ?? null,
        required_shape: {
          classification:
            "support_question | implementation_blocker | product_feedback | unknown",
          confidence: "number from 0 to 1",
          urgency: "low | medium | high",
          product_area: "string or null",
          reasoning_summary: "short user-safe explanation",
          recommended_actions: allowedActions,
          requires_human_review: "boolean",
        },
      }),
    },
  ];
}

export async function planWithModel(input: {
  message: string;
  account?: {
    name?: string | null;
    industry?: string | null;
    plan?: string | null;
    stage?: string | null;
    health_status?: string | null;
  } | null;
}): Promise<AgentPlan | null> {
  const payload = await callConfiguredModel(buildPlannerPrompt(input));
  const plan = validatePlan(payload);

  if (!plan && payload !== null) {
    console.warn(
      "Linea model planner returned invalid JSON shape; using deterministic fallback."
    );
  }

  return plan;
}
