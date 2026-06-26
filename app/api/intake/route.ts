import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { runBasicTriage } from "../../../lib/triage/engine";

export const runtime = "nodejs";

function generateCaseNumber() {
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `LIN-${today}-${random}`;
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

    await client.query(
      `INSERT INTO messages 
      (case_id, customer_id, channel, sender_type, message_text, internal_only, ai_generated)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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

    const aiResponse =
      "Thanks for reaching out. I found this looks related to CasaIQ Smart Lock battery troubleshooting. Please replace all four AA batteries with new alkaline batteries, wait 30 seconds, then press the reset button once. Are you currently locked out, or is the lock just not responding?";

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
