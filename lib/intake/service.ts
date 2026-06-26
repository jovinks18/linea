import {
  findCustomerAccount,
  type PostSalesAccount,
} from "../accounts/repository";
import { buildAgentActionAudit } from "../agent/audit";
import { buildAgentDecision, type AgentDecision } from "../agent/decision";
import { planWithModel } from "../agent/planner";
import { insertAgentActions } from "../agent/repository";
import {
  createCaseCreatedEvent,
  createSupportCase,
  findCaseForCustomer,
  updateCaseActivity,
} from "../cases/repository";
import { findOrCreateCustomer } from "../customers/repository";
import { pool } from "../db";
import { createMessage } from "../messages/repository";
import {
  detectOnboardingBlocker,
  type PostSalesActions,
} from "../post-sales/automation";
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

    const postSalesActions = await runPostSalesAutomation({
      client,
      account,
      supportCaseId: supportCase.id,
      customerMessageId: customerMessage.id,
      message,
    });

    const aiResponse = generateIntakeResponse({
      message,
      onboardingBlockerDetected: messageLevelOnboardingBlocker,
      hasLinkedAccount: account !== null,
    });

    const agentDecision = buildAgentDecision({
      message,
      hasLinkedAccount: account !== null,
      accountName: account?.name,
      intent: supportCase.intent ?? "question",
      sentiment: supportCase.sentiment ?? "neutral",
      priority: supportCase.priority,
      onboardingBlockerDetected: messageLevelOnboardingBlocker,
      actions: postSalesActions,
      modelPlan,
    });

    const agentActionAudit = buildAgentActionAudit({
      caseId: supportCase.id,
      accountId: account?.id ?? null,
      caseWasCreated,
      onboardingBlockerDetected: messageLevelOnboardingBlocker,
      actions: postSalesActions,
      decision: agentDecision,
    });

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
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
