import type { PoolClient } from "pg";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { updateAccountHealthStatus } from "../accounts/repository.ts";
import type { PostSalesAccount } from "../accounts/repository";
import type { ActionDirective } from "../agent/action-directives";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { createEmptyPostSalesActions, detectOnboardingBlocker } from "./automation.ts";
import type { PostSalesActions } from "./automation";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { executePostSalesAction } from "./execution-error.ts";

export async function runPostSalesAutomation({
  client,
  account,
  supportCaseId,
  customerMessageId,
  message,
  actionDirectives,
}: {
  client: PoolClient;
  account: PostSalesAccount | null;
  supportCaseId: number;
  customerMessageId: number;
  message: string;
  actionDirectives: ActionDirective[];
}): Promise<PostSalesActions> {
  const actions = createEmptyPostSalesActions();

  if (!detectOnboardingBlocker(message)) {
    return actions;
  }

  const directivesByAction = new Map(
    actionDirectives.map((directive) => [
      directive.action_type,
      directive,
    ])
  );
  const canExecute = (actionType: string) =>
    directivesByAction.get(actionType)?.execute === true;

  actions.onboarding_blocker_detected = canExecute(
    "detect_onboarding_blocker"
  );

  if (!account) {
    return actions;
  }

  if (canExecute("create_csm_task")) {
    const taskResult = await executePostSalesAction("create_csm_task", () =>
      client.query(
        `INSERT INTO tasks
      (account_id, case_id, title, description, status, priority, owner_role, due_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE + 1)
     ON CONFLICT (account_id, title) DO UPDATE SET
      case_id = EXCLUDED.case_id,
      description = EXCLUDED.description,
      status = EXCLUDED.status,
      priority = EXCLUDED.priority,
      owner_role = EXCLUDED.owner_role,
      due_date = EXCLUDED.due_date,
      updated_at = NOW()`,
        [
          account.id,
          supportCaseId,
          "Follow up on onboarding blocker",
          `Customer message: ${message}`,
          "open",
          "P1",
          account.owner_name ?? "Unassigned",
        ]
      )
    );

    actions.task_created = taskResult.rowCount === 1;
  }

  if (canExecute("log_product_signal")) {
    const productSignalResult = await executePostSalesAction(
      "log_product_signal",
      () =>
        client.query(
          `INSERT INTO product_signals
      (account_id, case_id, source_message_id, signal_type, title, description, severity, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (account_id, signal_type, title) DO UPDATE SET
      case_id = EXCLUDED.case_id,
      source_message_id = EXCLUDED.source_message_id,
      description = EXCLUDED.description,
      severity = EXCLUDED.severity,
      status = EXCLUDED.status,
      updated_at = NOW()`,
          [
            account.id,
            supportCaseId,
            customerMessageId,
            "integration_blocker",
            "Onboarding blocker reported",
            `Product area: Implementation\nCustomer message: ${message}`,
            "high",
            "new",
          ]
        )
    );

    actions.product_signal_created = productSignalResult.rowCount === 1;
  }

  if (canExecute("create_account_health_event")) {
    const healthEventResult = await executePostSalesAction(
      "create_account_health_event",
      () =>
        client.query(
          `INSERT INTO account_health_events
      (account_id, case_id, health_status, event_type, event_description, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (account_id, event_type, event_description) DO UPDATE SET
      case_id = EXCLUDED.case_id,
      health_status = EXCLUDED.health_status,
      metadata = EXCLUDED.metadata`,
          [
            account.id,
            supportCaseId,
            "at_risk",
            "risk_detected",
            "Customer reported an onboarding or go-live blocker.",
            JSON.stringify({
              previous_status: account.health_status,
              new_status: "at_risk",
              reason:
                "Customer reported an onboarding or go-live blocker.",
            }),
          ]
        )
    );

    actions.health_event_created = healthEventResult.rowCount === 1;
  }

  if (canExecute("update_account_health")) {
    const accountUpdateResult = await executePostSalesAction(
      "update_account_health",
      () =>
        updateAccountHealthStatus({
          client,
          accountId: account.id,
          healthStatus: "at_risk",
        })
    );

    actions.account_health_updated = accountUpdateResult.rowCount === 1;

    if (actions.account_health_updated) {
      account.health_status = "at_risk";
    }
  }

  return actions;
}
