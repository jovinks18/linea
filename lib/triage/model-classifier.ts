import type { AgentClassification } from "../agent/types";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { callConfiguredModel } from "../models/provider.ts";
import type {
  TriageIntent,
  TriagePriority,
  TriageSentiment,
} from "./types";

export type ModelTriageClassification = {
  intent: TriageIntent;
  sentiment: TriageSentiment;
  priority: TriagePriority;
  classification: AgentClassification;
};

type AccountContext = {
  name?: string | null;
  industry?: string | null;
  plan?: string | null;
  stage?: string | null;
  health_status?: string | null;
} | null;

const allowedIntents = [
  "question",
  "request",
  "complaint",
  "no_action",
] as const satisfies readonly TriageIntent[];

const allowedSentiments = [
  "positive",
  "neutral",
  "negative",
] as const satisfies readonly TriageSentiment[];

const allowedPriorities = [
  "P0",
  "P1",
  "P2",
  "P3",
] as const satisfies readonly TriagePriority[];

const allowedClassifications = [
  "support_question",
  "implementation_blocker",
  "product_feedback",
  "unknown",
] as const satisfies readonly AgentClassification[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateClassification(value: unknown): ModelTriageClassification | null {
  if (!isRecord(value)) return null;

  const { intent, sentiment, priority, classification } = value;

  if (
    typeof intent !== "string" ||
    !allowedIntents.includes(intent as TriageIntent)
  ) {
    return null;
  }

  if (
    typeof sentiment !== "string" ||
    !allowedSentiments.includes(sentiment as TriageSentiment)
  ) {
    return null;
  }

  if (
    typeof priority !== "string" ||
    !allowedPriorities.includes(priority as TriagePriority)
  ) {
    return null;
  }

  if (
    typeof classification !== "string" ||
    !allowedClassifications.includes(classification as AgentClassification)
  ) {
    return null;
  }

  return {
    intent: intent as TriageIntent,
    sentiment: sentiment as TriageSentiment,
    priority: priority as TriagePriority,
    classification: classification as AgentClassification,
  };
}

function buildClassifierPrompt(input: {
  message: string;
  account: AccountContext;
}) {
  return [
    {
      role: "system" as const,
      content:
        "You are Linea's triage classifier. Return strict JSON only. The model classifies the customer message, but never decides execution and never claims actions were taken. Follow these rules: implementation_blocker means a currently blocked state that stops onboarding or launch progress, not merely blocker-like words; support_question means a functional/how-to/device issue that is not blocking onboarding; product_feedback means feature request, missing capability, or documentation gap; unknown means negative complaint with no clear actionable technical category. Priority is impact-based: P1 for blocked/down/many users/SLA or imminent go-live risk; P2 for degraded single-user or workaround cases; P3 for minor, informational, or future-dated no-current-impact cases. Human-review stakes do not change classification, but they should influence priority when impact is high. Use no_action only for clearly positive messages with no request.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        message: input.message,
        account: input.account,
        required_shape: {
          intent: "question | request | complaint | no_action",
          sentiment: "positive | neutral | negative",
          priority: "P0 | P1 | P2 | P3",
          classification:
            "support_question | implementation_blocker | product_feedback | unknown",
        },
      }),
    },
  ];
}

export async function classifyWithModel(input: {
  message: string;
  account?: AccountContext;
}): Promise<ModelTriageClassification | null> {
  const payload = await callConfiguredModel(
    buildClassifierPrompt({
      message: input.message,
      account: input.account ?? null,
    }),
    { logFallback: false }
  );

  return validateClassification(payload);
}
