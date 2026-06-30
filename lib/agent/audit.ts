import type {
  AgentActionInput,
  AgentActionStatus,
  AgentActionType,
} from "./repository";
import type { ActionDirective } from "./action-directives";
import type { ExecutionResult, PolicyDecision } from "./types";

type BuildAgentActionAuditInput = {
  executionResult: ExecutionResult;
  policyDecision: PolicyDecision;
  now?: Date;
};

type BuildFailedAgentActionAuditInput = {
  actionType: AgentActionType;
  caseId: number | null;
  accountId: number | null;
  policyDecision: PolicyDecision;
  directive?: ActionDirective;
  error: unknown;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unknown post-sales action error";
}

function getDirectiveMetadata(
  directive: ActionDirective,
  reason = directive.reason
) {
  return {
    reason,
    tier: directive.tier,
    counterfactual: directive.counterfactual ?? false,
    enqueue_review: directive.enqueue_review ?? false,
    confidence_floor: directive.confidence_floor,
    max_blast_radius: directive.max_blast_radius,
    requires_reversible: directive.requires_reversible,
    blast_radius: directive.blast_radius,
    blast_radius_scope: directive.blast_radius_scope,
    blast_radius_reason: directive.blast_radius_reason,
    reversible: directive.reversible,
    breaker_tripped: directive.breaker_tripped,
    breaker_reasons: directive.breaker_reasons,
    breaker_keys: directive.breaker_keys,
    breaker_source: directive.breaker_source,
    segment: directive.segment,
  };
}

export function buildFailedAgentActionAudit({
  actionType,
  caseId,
  accountId,
  policyDecision,
  directive,
  error,
}: BuildFailedAgentActionAuditInput): AgentActionInput {
  return {
    case_id: caseId,
    account_id: accountId,
    action_type: actionType,
    status: "failed",
    source: policyDecision.source,
    confidence: policyDecision.confidence,
    reasoning_summary: policyDecision.reasoning_summary,
    metadata: {
      ...(directive ? getDirectiveMetadata(directive) : {}),
      reason: "Post-sales action failed",
      error: getErrorMessage(error),
    },
    executed_at: null,
  };
}

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

  for (const action of executionResult.executed_actions) {
    const directive = executionResult.executed_directives.find(
      (candidate) => candidate.action_type === action
    );
    addAction({
      actionType: action,
      status: "executed",
      metadata: {
        ...(directive ? getDirectiveMetadata(directive) : {}),
        ...(action === "create_support_case"
          ? {
              case_resolution: executionResult.support_case_resolution,
            }
          : {}),
      },
    });
  }

  for (const directive of executionResult.suggested_actions) {
    addAction({
      actionType: directive.action_type,
      status: "suggested",
      metadata: getDirectiveMetadata(directive),
    });
  }

  for (const outcome of executionResult.skipped_actions) {
    addAction({
      actionType: outcome.action,
      status: "skipped",
      metadata: outcome.directive
        ? getDirectiveMetadata(outcome.directive, outcome.reason)
        : { reason: outcome.reason },
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
