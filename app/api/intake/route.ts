import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { pool } from "../../../lib/db";
import {
  createEmptyPostSalesActions,
  detectOnboardingBlocker,
  type PostSalesActions,
} from "../../../lib/post-sales/automation";
import { runBasicTriage } from "../../../lib/triage/engine";

export const runtime = "nodejs";

type PostSalesAccount = {
  id: number;
  name: string;
  industry: string | null;
  plan: string | null;
  stage: string | null;
  health_status: string | null;
  owner_name: string | null;
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

async function findCustomerAccount(
  client: PoolClient,
  customerId: number
): Promise<PostSalesAccount | null> {
  const accountResult = await client.query(
    `SELECT
      a.id,
      a.name,
      a.industry,
      a.plan,
      a.stage,
      a.health_status,
      a.owner_name
    FROM account_contacts ac
    JOIN accounts a ON a.id = ac.account_id
    WHERE ac.customer_id = $1
    ORDER BY ac.is_primary DESC, ac.created_at ASC
    LIMIT 1`,
    [customerId]
  );

  return accountResult.rows[0] ?? null;
}

async function runPostSalesAutomation({
  client,
  account,
  supportCaseId,
  customerMessageId,
  message,
}: {
  client: PoolClient;
  account: PostSalesAccount | null;
  supportCaseId: number;
  customerMessageId: number;
  message: string;
}): Promise<PostSalesActions> {
  const actions = createEmptyPostSalesActions();

  if (!account || !detectOnboardingBlocker(message)) {
    return actions;
  }

  actions.onboarding_blocker_detected = true;

  const taskResult = await client.query(
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
  );

  actions.task_created = taskResult.rowCount === 1;

  const productSignalResult = await client.query(
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
  );

  actions.product_signal_created = productSignalResult.rowCount === 1;

  const healthEventResult = await client.query(
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
        reason: "Customer reported an onboarding or go-live blocker.",
      }),
    ]
  );

  actions.health_event_created = healthEventResult.rowCount === 1;

  const accountUpdateResult = await client.query(
    `UPDATE accounts
     SET health_status = $1, updated_at = NOW()
     WHERE id = $2`,
    ["at_risk", account.id]
  );

  actions.account_health_updated = accountUpdateResult.rowCount === 1;
  account.health_status = "at_risk";

  return actions;
}

export async function POST(req: Request) {
  let client;

  try {
    const body = await req.json();

    const {
      channel = "web_chat",
      customer_email,
      case_number,
      message,
    } = body;

    if (!customer_email || !message) {
      return NextResponse.json(
        { error: "customer_email and message are required" },
        { status: 400 }
      );
    }

    client = await pool.connect();

    await client.query("BEGIN");

    const customerResult = await client.query(
      "SELECT * FROM customers WHERE email = $1",
      [customer_email]
    );

    let customer = customerResult.rows[0];

    if (!customer) {
      const newCustomerResult = await client.query(
        `INSERT INTO customers (email, preferred_channel)
         VALUES ($1, $2)
         RETURNING *`,
        [customer_email, channel]
      );

      customer = newCustomerResult.rows[0];
    }

    const account = await findCustomerAccount(client, customer.id);

    let supportCase = null;

    if (case_number) {
      const caseResult = await client.query(
        `SELECT * FROM cases 
         WHERE case_number = $1 AND customer_id = $2`,
        [case_number, customer.id]
      );

      supportCase = caseResult.rows[0];
    }

    if (!supportCase) {
      const newCaseNumber = generateCaseNumber();
      const triage = runBasicTriage(message);

      const newCaseResult = await client.query(
        `INSERT INTO cases 
        (case_number, customer_id, subject, status, intent, sentiment, priority, channel_origin)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          newCaseNumber,
          customer.id,
          triage.subject,
          "open",
          triage.intent,
          triage.sentiment,
          triage.priority,
          channel,
        ]
      );

      supportCase = newCaseResult.rows[0];

      await client.query(
        `INSERT INTO case_events 
        (case_id, event_type, event_description, metadata)
        VALUES ($1, $2, $3, $4)`,
        [
          supportCase.id,
          "case_created",
          "New support case created",
          JSON.stringify({ source: channel }),
        ]
      );
    }

    const customerMessageResult = await client.query(
      `INSERT INTO messages 
      (case_id, customer_id, channel, sender_type, message_text, internal_only, ai_generated)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
      [
        supportCase.id,
        customer.id,
        channel,
        "customer",
        message,
        false,
        false,
      ]
    );

    const customerMessage = customerMessageResult.rows[0];

    const postSalesActions = await runPostSalesAutomation({
      client,
      account,
      supportCaseId: supportCase.id,
      customerMessageId: customerMessage.id,
      message,
    });

    const aiResponse = createDemoResponse(message);

    await client.query(
      `INSERT INTO messages 
      (case_id, customer_id, channel, sender_type, message_text, internal_only, ai_generated)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        supportCase.id,
        customer.id,
        channel,
        "ai",
        aiResponse,
        false,
        true,
      ]
    );

    await client.query(
      `UPDATE cases 
       SET last_activity_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [supportCase.id]
    );

    await client.query("COMMIT");

    return NextResponse.json({
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
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK");
    }

    console.error("Linea intake error:", error);

    return NextResponse.json(
      { error: "Failed to process support message" },
      { status: 500 }
    );
  } finally {
    if (client) {
      client.release();
    }
  }
}
