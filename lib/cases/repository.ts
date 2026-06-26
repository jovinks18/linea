import type { PoolClient } from "pg";
import type { BasicTriageResult } from "../triage/types";

export type SupportCaseRecord = {
  id: number;
  case_number: string;
  customer_id: number;
  subject: string | null;
  status: string;
  intent: string | null;
  sentiment: string | null;
  priority: string;
  channel_origin: string | null;
  last_activity_at: Date;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
};

export async function findCaseForCustomer({
  client,
  caseNumber,
  customerId,
}: {
  client: PoolClient;
  caseNumber: string;
  customerId: number;
}): Promise<SupportCaseRecord | null> {
  const result = await client.query<SupportCaseRecord>(
    `SELECT * FROM cases
     WHERE case_number = $1 AND customer_id = $2`,
    [caseNumber, customerId]
  );

  return result.rows[0] ?? null;
}

export async function createSupportCase({
  client,
  caseNumber,
  customerId,
  triage,
  channel,
}: {
  client: PoolClient;
  caseNumber: string;
  customerId: number;
  triage: BasicTriageResult;
  channel: string;
}): Promise<SupportCaseRecord> {
  const result = await client.query<SupportCaseRecord>(
    `INSERT INTO cases
      (case_number, customer_id, subject, status, intent, sentiment, priority, channel_origin)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      caseNumber,
      customerId,
      triage.subject,
      "open",
      triage.intent,
      triage.sentiment,
      triage.priority,
      channel,
    ]
  );

  return result.rows[0];
}

export async function createCaseCreatedEvent({
  client,
  caseId,
  channel,
}: {
  client: PoolClient;
  caseId: number;
  channel: string;
}) {
  return client.query(
    `INSERT INTO case_events
      (case_id, event_type, event_description, metadata)
     VALUES ($1, $2, $3, $4)`,
    [
      caseId,
      "case_created",
      "New support case created",
      JSON.stringify({ source: channel }),
    ]
  );
}

export async function updateCaseActivity(
  client: PoolClient,
  caseId: number
) {
  return client.query(
    `UPDATE cases
     SET last_activity_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [caseId]
  );
}
