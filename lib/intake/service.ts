import { randomUUID } from "node:crypto";
import {
  findCustomerAccount,
  type PostSalesAccount,
} from "../accounts/repository";
import {
  buildAgentActionAudit,
  buildFailedAgentActionAudit,
} from "../agent/audit";
import { buildActionDirectives } from "../agent/action-directives";
import {
  getCircuitBreakerStatesForActions,
} from "../agent/circuit-breaker";
import { getAutonomySegment } from "../agent/autonomy-policy";
import {
  buildAgentDecision,
  buildAgentEnvelope,
  buildPolicyDecision,
  createModelProposal,
  type AgentDecision,
} from "../agent/decision";
import { buildExecutionResult } from "../agent/execution";
import { planWithModel } from "../agent/planner";
import {
  insertAgentActionDurably,
  insertAgentActions,
} from "../agent/repository";
import type { PolicyDecision } from "../agent/types";
import {
  createCaseCreatedEvent,
  createSupportCase,
  findCaseForCustomer,
  saveCaseAgentDecision,
  updateCaseActivity,
} from "../cases/repository";
import { findOrCreateCustomer } from "../customers/repository";
import { pool } from "../db";
import { createMessage } from "../messages/repository";
import {
  createEmptyPostSalesActions,
  detectOnboardingBlocker,
  type PostSalesActions,
} from "../post-sales/automation";
import { PostSalesActionExecutionError } from "../post-sales/execution-error";
import { runPostSalesAutomation } from "../post-sales/repository";
import { generateIntakeResponse } from "../responses/router";
import { runBasicTriage } from "../triage/engine";

export type IntakeRequest = {
  channel: string;
  customer_email: string;
  case_number?: string | null;
  message: string;
};

export type IntakeResponse = {
  case_number: string;
  status: string;
  response: string;
  intent: string | null;
  sentiment: string | null;
  priority: string;
  post_sales: {
    account: PostSalesAccount | null;
    actions: PostSalesActions;
  };
  agent_decision?: AgentDecision;
};

function generateCaseNumber() {
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `LIN-${today}-${random}`;
}

export async function processIntakeMessage({
  channel,
  customer_email,
  case_number,
  message,
}: IntakeRequest): Promise<IntakeResponse> {
  const client = await pool.connect();
  const intakeRunId = randomUUID();
  let failureAuditContext: {
    caseId: number | null;
    accountId: number | null;
    policyDecision: PolicyDecision;
    actionDirectives: Awaited<ReturnType<typeof buildActionDirectives>>;
  } | null = null;

  try {
    await client.query("BEGIN");

    const customer = await findOrCreateCustomer({
      client,
      email: customer_email,
      preferredChannel: channel,
    });

    const account = await findCustomerAccount(client, customer.id);
    const messageLevelOnboardingBlocker = detectOnboardingBlocker(message);
    const deterministicTriage = runBasicTriage(message);
    const modelPlan = await planWithModel({
      message,
      account: account
        ? {
            name: account.name,
            industry: account.industry,
            plan: account.plan,
            stage: account.stage,
            health_status: account.health_status,
          }
        : null,
    });

    let supportCase = case_number
      ? await findCaseForCustomer({
          client,
          caseNumber: case_number,
          customerId: customer.id,
        })
      : null;
    const caseWasCreated = supportCase === null;

    if (!supportCase) {
      supportCase = await createSupportCase({
        client,
        caseNumber: generateCaseNumber(),
        customerId: customer.id,
        triage: deterministicTriage,
        channel,
      });

      await createCaseCreatedEvent({
        client,
        caseId: supportCase.id,
        channel,
      });
    }

    const customerMessage = await createMessage({
      client,
      caseId: supportCase.id,
      customerId: customer.id,
      channel,
      senderType: "customer",
      messageText: message,
      internalOnly: false,
      aiGenerated: false,
    });

    const modelProposal = createModelProposal(modelPlan);
    const policyDecision = buildPolicyDecision({
      message,
      intent: supportCase.intent ?? "question",
      priority: supportCase.priority,
      onboardingBlockerDetected: messageLevelOnboardingBlocker,
      executionResult: buildExecutionResult({
        caseId: supportCase.id,
        accountId: account?.id ?? null,
        caseWasCreated,
        onboardingBlockerDetected: messageLevelOnboardingBlocker,
        actions: createEmptyPostSalesActions(),
      }),
      modelProposal,
    });
    const accountId = account?.id ?? null;
    const autonomySegment = getAutonomySegment({ accountId });
    const breakerStates = await getCircuitBreakerStatesForActions(client, {
      actionTypes: policyDecision.recommended_actions.filter(
        (actionType) => actionType !== "create_support_case"
      ),
      segment: autonomySegment,
      accountId,
    });
    const actionDirectives = await buildActionDirectives({
      client,
      policyDecision,
      accountId,
      caseId: supportCase.id,
      affectedAccountIds: account ? [account.id] : [],
      affectedCustomerIds: [customer.id],
      isBatch: false,
      isPolicyChange: false,
      breakerStates,
    });

    failureAuditContext = {
      caseId: caseWasCreated ? null : supportCase.id,
      accountId,
      policyDecision,
      actionDirectives,
    };

    const postSalesActions = await runPostSalesAutomation({
      client,
      account,
      supportCaseId: supportCase.id,
      customerMessageId: customerMessage.id,
      message,
      actionDirectives,
    });
    const executionResult = buildExecutionResult({
      caseId: supportCase.id,
      accountId: account?.id ?? null,
      caseWasCreated,
      onboardingBlockerDetected: messageLevelOnboardingBlocker,
      actions: postSalesActions,
      actionDirectives,
    });

    const aiResponse = generateIntakeResponse({
      message,
      onboardingBlockerDetected: messageLevelOnboardingBlocker,
      hasLinkedAccount: account !== null,
      automationBlockedByBreaker: actionDirectives.some(
        (directive) =>
          directive.action_type !== "create_support_case" &&
          directive.breaker_tripped &&
          !directive.execute
      ),
    });

    const agentEnvelope = buildAgentEnvelope({
      modelProposal,
      policyDecision,
      actionDirectives,
      executionResult,
    });
    const agentDecision = buildAgentDecision({
      policyDecision: agentEnvelope.policy_decision,
      executionResult: agentEnvelope.execution_result,
    });

    const agentActionAudit = buildAgentActionAudit({
      executionResult: agentEnvelope.execution_result,
      policyDecision: agentEnvelope.policy_decision,
      intakeRunId,
    });

    await saveCaseAgentDecision(client, supportCase.id, agentDecision);
    await insertAgentActions(client, agentActionAudit);

    await createMessage({
      client,
      caseId: supportCase.id,
      customerId: customer.id,
      channel,
      senderType: "ai",
      messageText: aiResponse,
      internalOnly: false,
      aiGenerated: true,
    });

    await updateCaseActivity(client, supportCase.id);

    await client.query("COMMIT");

    return {
      case_number: supportCase.case_number,
      status: supportCase.status,
      response: aiResponse,
      intent: supportCase.intent,
      sentiment: supportCase.sentiment,
      priority: supportCase.priority,
      post_sales: {
        account,
        actions: postSalesActions,
      },
      agent_decision: agentDecision,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.warn(
        "Failed to roll back intake transaction",
        rollbackError instanceof Error ? rollbackError.message : "Unknown error"
      );
    }

    if (
      error instanceof PostSalesActionExecutionError &&
      failureAuditContext
    ) {
      const failedAudit = buildFailedAgentActionAudit({
        actionType: error.actionType,
        caseId: failureAuditContext.caseId,
        accountId: failureAuditContext.accountId,
        policyDecision: failureAuditContext.policyDecision,
        directive: failureAuditContext.actionDirectives.find(
          (directive) => directive.action_type === error.actionType
        ),
        error: error.originalError,
        intakeRunId,
      });

      try {
        await insertAgentActionDurably(pool, failedAudit);
      } catch (auditError) {
        console.warn(
          "Failed to persist post-sales failure audit",
          auditError instanceof Error ? auditError.message : "Unknown error"
        );
      }
    }

    throw error;
  } finally {
    client.release();
  }
}
