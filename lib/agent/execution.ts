import type { PostSalesActions } from "../post-sales/automation";
import type {
  AgentActionName,
  AgentActionOutcome,
  ExecutionResult,
} from "./types";

function getExecutedActions(actions: PostSalesActions): AgentActionName[] {
  const executedActions: AgentActionName[] = [];

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

function getSkippedActions({
  accountId,
  onboardingBlockerDetected,
}: {
  accountId: number | null;
  onboardingBlockerDetected: boolean;
}): AgentActionOutcome[] {
  if (!onboardingBlockerDetected || accountId !== null) return [];

  return [
    { action: "create_csm_task", reason: "No linked account" },
    { action: "log_product_signal", reason: "No linked account" },
    { action: "update_account_health", reason: "No linked account" },
  ];
}

export function buildExecutionResult({
  caseId,
  accountId,
  caseWasCreated,
  onboardingBlockerDetected,
  actions,
}: {
  caseId: number;
  accountId: number | null;
  caseWasCreated: boolean;
  onboardingBlockerDetected: boolean;
  actions: PostSalesActions;
}): ExecutionResult {
  return {
    executed_actions: getExecutedActions(actions),
    skipped_actions: getSkippedActions({
      accountId,
      onboardingBlockerDetected,
    }),
    failed_actions: [],
    post_sales_actions: actions,
    account_id: accountId,
    case_id: caseId,
    support_case_resolution: caseWasCreated ? "created" : "restored",
  };
}
