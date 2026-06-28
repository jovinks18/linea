import type { PostSalesActions } from "../post-sales/automation";
import type { ActionDirective } from "./action-directives";
import type {
  AgentActionName,
  AgentActionOutcome,
  ExecutionResult,
} from "./types";

const accountActionNames = new Set([
  "create_csm_task",
  "log_product_signal",
  "create_account_health_event",
  "update_account_health",
]);

function didActionExecute(
  actionType: string,
  actions: PostSalesActions
) {
  if (actionType === "detect_onboarding_blocker") {
    return actions.onboarding_blocker_detected;
  }
  if (actionType === "create_csm_task") return actions.task_created;
  if (actionType === "log_product_signal") {
    return actions.product_signal_created;
  }
  if (actionType === "create_account_health_event") {
    return actions.health_event_created;
  }
  if (actionType === "update_account_health") {
    return actions.account_health_updated;
  }

  return actionType === "require_human_review";
}

export function buildExecutionResult({
  caseId,
  accountId,
  caseWasCreated,
  onboardingBlockerDetected,
  actions,
  actionDirectives = [],
}: {
  caseId: number;
  accountId: number | null;
  caseWasCreated: boolean;
  onboardingBlockerDetected: boolean;
  actions: PostSalesActions;
  actionDirectives?: ActionDirective[];
}): ExecutionResult {
  const executedActions: AgentActionName[] = ["create_support_case"];
  const executedDirectives: ActionDirective[] = [];
  const suggestedActions: ActionDirective[] = [];
  const skippedActions: AgentActionOutcome[] = [];

  for (const directive of actionDirectives) {
    if (directive.action_type === "create_support_case") {
      executedDirectives.push(directive);
      continue;
    }

    if (!directive.execute) {
      suggestedActions.push(directive);
      continue;
    }

    if (
      accountId === null &&
      accountActionNames.has(directive.action_type)
    ) {
      skippedActions.push({
        action: directive.action_type,
        reason: "No linked account",
        directive,
      });
      continue;
    }

    if (didActionExecute(directive.action_type, actions)) {
      executedActions.push(directive.action_type as AgentActionName);
      executedDirectives.push(directive);
      continue;
    }

    skippedActions.push({
      action: directive.action_type,
      reason: onboardingBlockerDetected
        ? "Action did not produce a completed outcome"
        : "Onboarding blocker was not detected",
      directive,
    });
  }

  return {
    executed_actions: executedActions,
    executed_directives: executedDirectives,
    suggested_actions: suggestedActions,
    skipped_actions: skippedActions,
    failed_actions: [],
    post_sales_actions: actions,
    account_id: accountId,
    case_id: caseId,
    support_case_resolution: caseWasCreated ? "created" : "restored",
  };
}
