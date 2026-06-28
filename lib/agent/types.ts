import type { PostSalesActions } from "../post-sales/automation";
import type { ActionDirective } from "./action-directives";

export type AgentClassification =
  | "support_question"
  | "implementation_blocker"
  | "product_feedback"
  | "unknown";

export type AgentUrgency = "low" | "medium" | "high";

export type AgentRecommendedAction =
  | "create_support_case"
  | "detect_onboarding_blocker"
  | "create_csm_task"
  | "log_product_signal"
  | "create_account_health_event"
  | "update_account_health"
  | "require_human_review";

export type AgentActionName =
  | AgentRecommendedAction
  | "flag_human_review";

export type AgentDecisionSource =
  | "deterministic"
  | "model"
  | "hybrid"
  | "operator";

export type ModelProposal = {
  classification: AgentClassification;
  confidence: number;
  urgency: AgentUrgency;
  product_area: string | null;
  reasoning_summary: string;
  recommended_actions: AgentRecommendedAction[];
  requires_human_review: boolean;
  source: "model";
};

export type PolicyDecision = {
  classification: AgentClassification;
  confidence: number;
  urgency: AgentUrgency;
  product_area: string | null;
  reasoning_summary: string;
  recommended_actions: AgentRecommendedAction[];
  requires_human_review: boolean;
  source: AgentDecisionSource;
};

export type AgentActionOutcome = {
  action: string;
  reason: string;
  directive?: ActionDirective;
};

export type ExecutionResult = {
  executed_actions: AgentActionName[];
  suggested_actions: ActionDirective[];
  skipped_actions: AgentActionOutcome[];
  failed_actions: AgentActionOutcome[];
  post_sales_actions: PostSalesActions;
  account_id: number | null;
  case_id: number;
  support_case_resolution: "created" | "restored";
};

export type AgentDecision = PolicyDecision & {
  executed_actions: AgentActionName[];
};

export type AgentEnvelope = {
  model_proposal: ModelProposal | null;
  policy_decision: PolicyDecision;
  action_directives: ActionDirective[];
  execution_result: ExecutionResult;
};
