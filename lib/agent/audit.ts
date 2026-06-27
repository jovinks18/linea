import type {
  AgentActionInput,
  AgentActionStatus,
  AgentActionType,
} from "./repository";
import type { ExecutionResult, PolicyDecision } from "./types";

type BuildAgentActionAuditInput = {
  executionResult: ExecutionResult;
  policyDecision: PolicyDecision;
  now?: Date;
};

export function buildAgentActionAudit({
  executionResult,
  policyDecision,
  now = new Date(),
}: BuildAgentActionAuditInput): AgentActionInput[] {
  const auditRows: AgentActionInput[] = [];

  const addAction = ({
    actionType,
    status,
    metadata = {},
  }: {
    actionType: AgentActionType;
    status: AgentActionStatus;
    metadata?: Record<string, unknown>;
  }) => {
    auditRows.push({
      case_id: executionResult.case_id,
      account_id: executionResult.account_id,
      action_type: actionType,
      status,
      source: policyDecision.source,
      confidence: policyDecision.confidence,
      reasoning_summary: policyDecision.reasoning_summary,
      metadata,
      executed_at: status === "executed" ? now : null,
    });
  };

  if (executionResult.executed_actions.length === 0) {
    addAction({
      actionType: "create_support_case",
      status: "executed",
      metadata: {
        case_resolution: executionResult.support_case_resolution,
      },
    });
  } else {
    for (const action of executionResult.executed_actions) {
      addAction({
        actionType: action,
        status: "executed",
      });
    }
  }

  if (policyDecision.requires_human_review) {
    addAction({
      actionType: "require_human_review",
      status: "suggested",
      metadata: {
        reason:
          executionResult.account_id === null
            ? "No linked account"
            : "Policy requires human review",
      },
    });
  }

  for (const outcome of executionResult.skipped_actions) {
    addAction({
      actionType: outcome.action,
      status: "skipped",
      metadata: { reason: outcome.reason },
    });
  }

  for (const outcome of executionResult.failed_actions) {
    addAction({
      actionType: outcome.action,
      status: "failed",
      metadata: { reason: outcome.reason },
    });
  }

  return auditRows;
}
