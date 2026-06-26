import type { PostSalesActions } from "../post-sales/automation";
import type { AgentDecisionSource } from "./decision";
import type {
  AgentActionInput,
  AgentActionStatus,
  AgentActionType,
} from "./repository";

type AuditDecisionContext = {
  confidence?: unknown;
  reasoning_summary?: string | null;
  source?: unknown;
};

type BuildAgentActionAuditInput = {
  caseId: number;
  accountId: number | null;
  caseWasCreated: boolean;
  onboardingBlockerDetected: boolean;
  actions: PostSalesActions;
  decision: AuditDecisionContext;
  now?: Date;
};

function normalizeConfidence(confidence: unknown): number | null {
  return typeof confidence === "number" &&
    Number.isFinite(confidence) &&
    confidence >= 0 &&
    confidence <= 1
    ? confidence
    : null;
}

function normalizeSource(source: unknown): AgentDecisionSource {
  return source === "model" || source === "hybrid"
    ? source
    : "deterministic";
}

export function buildAgentActionAudit({
  caseId,
  accountId,
  caseWasCreated,
  onboardingBlockerDetected,
  actions,
  decision,
  now = new Date(),
}: BuildAgentActionAuditInput): AgentActionInput[] {
  const auditRows: AgentActionInput[] = [];
  const confidence = normalizeConfidence(decision.confidence);
  const source = normalizeSource(decision.source);

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
      case_id: caseId,
      account_id: accountId,
      action_type: actionType,
      status,
      source,
      confidence,
      reasoning_summary:
        typeof decision.reasoning_summary === "string"
          ? decision.reasoning_summary
          : null,
      metadata,
      executed_at: status === "executed" ? now : null,
    });
  };

  const hasExecutedPostSalesAction =
    actions.onboarding_blocker_detected ||
    actions.task_created ||
    actions.product_signal_created ||
    actions.health_event_created ||
    actions.account_health_updated;

  if (hasExecutedPostSalesAction) {
    if (actions.onboarding_blocker_detected) {
      addAction({
        actionType: "detect_onboarding_blocker",
        status: "executed",
      });
    }

    if (actions.task_created) {
      addAction({
        actionType: "create_csm_task",
        status: "executed",
      });
    }

    if (actions.product_signal_created) {
      addAction({
        actionType: "log_product_signal",
        status: "executed",
      });
    }

    if (actions.health_event_created) {
      addAction({
        actionType: "create_account_health_event",
        status: "executed",
      });
    }

    if (actions.account_health_updated) {
      addAction({
        actionType: "update_account_health",
        status: "executed",
      });
    }
  } else {
    addAction({
      actionType: "create_support_case",
      status: "executed",
      metadata: {
        case_resolution: caseWasCreated ? "created" : "restored",
      },
    });

    if (onboardingBlockerDetected) {
      // Review is suggested because Linea raises the need but does not assign or approve human work.
      addAction({
        actionType: "require_human_review",
        status: "suggested",
        metadata: { reason: "No linked account" },
      });

      for (const actionType of [
        "create_csm_task",
        "log_product_signal",
        "update_account_health",
      ] as const) {
        addAction({
          actionType,
          status: "skipped",
          metadata: { reason: "No linked account" },
        });
      }
    }
  }

  return auditRows;
}
