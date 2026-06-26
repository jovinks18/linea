import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ case_number: string }> }
) {
  const { case_number } = await params;

  if (!case_number) {
    return NextResponse.json(
      { error: "case_number is required" },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    const caseResult = await client.query(
      `SELECT 
        c.id,
        c.case_number,
        c.subject,
        c.status,
        c.intent,
        c.sentiment,
        c.priority,
        c.channel_origin,
        c.created_at,
        c.updated_at,
        c.last_activity_at,
        cu.name AS customer_name,
        cu.email AS customer_email
      FROM cases c
      JOIN customers cu ON cu.id = c.customer_id
      WHERE c.case_number = $1`,
      [case_number]
    );

    const supportCase = caseResult.rows[0];

    if (!supportCase) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404 }
      );
    }

    const messagesResult = await client.query(
      `SELECT 
        id,
        sender_type,
        channel,
        message_text,
        internal_only,
        ai_generated,
        created_at
      FROM messages
      WHERE case_id = $1
      ORDER BY created_at ASC`,
      [supportCase.id]
    );

    return NextResponse.json({
      case: supportCase,
      messages: messagesResult.rows,
    });
  } catch (error) {
    console.error("Linea case fetch error:", error);

    return NextResponse.json(
      { error: "Failed to fetch case" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}