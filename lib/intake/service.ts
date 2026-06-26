import {
  findCustomerAccount,
  type PostSalesAccount,
} from "../accounts/repository";
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
};

function generateCaseNumber() {
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `LIN-${today}-${random}`;
}

function createDemoResponse(message: string) {
  if (detectOnboardingBlocker(message)) {
    return "Thanks for flagging this. I've marked this as an onboarding blocker, created a CSM follow-up task, logged an implementation product signal, and updated the account health to at-risk. A team member should follow up before the go-live date.";
  }

  return "Thanks for reaching out. I found this looks related to CasaIQ Smart Lock battery troubleshooting. Please replace all four AA batteries with new alkaline batteries, wait 30 seconds, then press the reset button once. Are you currently locked out, or is the lock just not responding?";
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

    let supportCase = case_number
      ? await findCaseForCustomer({
          client,
          caseNumber: case_number,
          customerId: customer.id,
        })
      : null;

    if (!supportCase) {
      const triage = runBasicTriage(message);

      supportCase = await createSupportCase({
        client,
        caseNumber: generateCaseNumber(),
        customerId: customer.id,
        triage,
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

    const aiResponse = createDemoResponse(message);

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
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
