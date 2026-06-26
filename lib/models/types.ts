export type ModelProvider = "deterministic" | "openai_compatible" | "ollama";

export type AgentPlanClassification =
  | "support_question"
  | "implementation_blocker"
  | "product_feedback"
  | "unknown";

export type AgentPlanUrgency = "low" | "medium" | "high";

export type AgentPlan = {
  classification: AgentPlanClassification;
  confidence: number;
  urgency: AgentPlanUrgency;
  product_area?: string | null;
  reasoning_summary: string;
  recommended_actions: string[];
  requires_human_review: boolean;
};

export type ModelChatMessage = {
  role: "system" | "user";
  content: string;
};
