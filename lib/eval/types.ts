import type {
  AgentClassification,
  AgentRecommendedAction,
} from "../agent/types";
import type {
  TriageIntent,
  TriagePriority,
  TriageSentiment,
} from "../triage/types";

export type GoldenCaseSource = "seed" | "operator_correction";

export type GoldenAccountContext = {
  account_id: number;
  customer_id?: number | null;
  name?: string | null;
  industry?: string | null;
  plan?: string | null;
  stage?: string | null;
  health_status?: string | null;
};

export type GoldenCase = {
  input: {
    channel: string;
    message: string;
    account_context: GoldenAccountContext | null;
  };
  expected: {
    intent: TriageIntent;
    sentiment: TriageSentiment;
    priority: TriagePriority;
    classification: AgentClassification;
    recommended_actions: AgentRecommendedAction[];
    must_gate: boolean;
  };
  meta: {
    id: string;
    source: GoldenCaseSource;
    labeled_by: string;
    labeled_at: string;
  };
};

export type EvalCasePrediction = {
  id: string;
  subject: string;
  intent: TriageIntent;
  sentiment: TriageSentiment;
  priority: TriagePriority;
  classification: AgentClassification;
  recommended_actions: AgentRecommendedAction[];
  directive_executions: Record<string, boolean>;
  unsafe_gate_violation: boolean;
};

export type BinaryMetric = {
  true_positive: number;
  false_positive: number;
  false_negative: number;
  precision: number;
  recall: number;
  f1: number;
};

export type ClassificationMetric = BinaryMetric & {
  class_name: AgentClassification;
};

export type ActionMetric = BinaryMetric & {
  action_type: AgentRecommendedAction;
};

export type PriorityMetric = {
  exact_match_rate: number;
  off_by_one_rate: number;
  total: number;
};

export type EvalResult = {
  eval_run_id: string;
  mode: "offline";
  sample_size: number;
  passed: boolean;
  failures: string[];
  priority: PriorityMetric;
  classification_metrics: ClassificationMetric[];
  classification_confusion_matrix: Record<string, Record<string, number>>;
  action_metrics: ActionMetric[];
  unsafe_gate_rate: number;
  predictions: EvalCasePrediction[];
};
