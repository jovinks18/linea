import { pool } from "../db";
import type { AgentDecision } from "../agent/types";

export type CaseDetailRecord = {
  id: number;
  case_number: string;
  subject: string | null;
  status: string;
  intent: string | null;
  sentiment: string | null;
  priority: string;
  channel_origin: string | null;
  metadata: Record<string, unknown>;
  requires_human_review: boolean;
  review_status: "none" | "flagged" | "resolved";
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  customer_name: string | null;
  customer_email: string;
};

export type CaseAccountRecord = {
  id: number;
  name: string;
  industry: string | null;
  plan: string | null;
  stage: string | null;
  health_status: string | null;
  owner_name: string | null;
  metadata: Record<string, unknown>;
};

export type CaseMessageRecord = {
  id: number;
  sender_type: string;
  channel: string | null;
  message_text: string;
  internal_only: boolean;
  ai_generated: boolean;
  created_at: string;
};

export type CaseAgentActionRecord = {
  id: string;
  action_type: string;
  status: string;
  source: string;
  confidence: string | null;
  reasoning_summary: string | null;
  metadata: Record<string, unknown>;
  executed_at: string | null;
  created_at: string;
};

export type CaseDetail = {
  case: CaseDetailRecord;
  account: CaseAccountRecord | null;
  messages: CaseMessageRecord[];
  agent_actions: CaseAgentActionRecord[];
  agent_decision: AgentDecision | null;
};

function readAgentDecision(
  metadata: Record<string, unknown>
): AgentDecision | null {
  const value = metadata.agent_decision;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<AgentDecision>;
  if (
    typeof candidate.classification !== "string" ||
    typeof candidate.confidence !== "number" ||
    typeof candidate.reasoning_summary !== "string" ||
    !Array.isArray(candidate.recommended_actions) ||
    !Array.isArray(candidate.executed_actions) ||
    typeof candidate.requires_human_review !== "boolean"
  ) {
    return null;
  }

  return value as AgentDecision;
}

export async function getCaseDetail(
  caseNumber: string
): Promise<CaseDetail | null> {
  const caseResult = await pool.query<CaseDetailRecord & {
    account_id: number | null;
    account_name: string | null;
    account_industry: string | null;
    account_plan: string | null;
    account_stage: string | null;
    account_health_status: string | null;
    account_owner_name: string | null;
    account_metadata: Record<string, unknown> | null;
  }>(
    `SELECT
      c.id,
      c.case_number,
      c.subject,
      c.status,
      c.intent,
      c.sentiment,
      c.priority,
      c.channel_origin,
      c.metadata,
      c.requires_human_review,
      c.review_status,
      c.created_at::text,
      c.updated_at::text,
      c.last_activity_at::text,
      cu.name AS customer_name,
      cu.email AS customer_email,
      linked_account.id AS account_id,
      linked_account.name AS account_name,
      linked_account.industry AS account_industry,
      linked_account.plan AS account_plan,
      linked_account.stage AS account_stage,
      linked_account.health_status AS account_health_status,
      linked_account.owner_name AS account_owner_name,
      linked_account.metadata AS account_metadata
     FROM cases c
     JOIN customers cu ON cu.id = c.customer_id
     LEFT JOIN LATERAL (
       SELECT a.*
       FROM account_contacts ac
       JOIN accounts a ON a.id = ac.account_id
       WHERE ac.customer_id = cu.id
       ORDER BY ac.is_primary DESC, ac.created_at ASC
       LIMIT 1
     ) linked_account ON TRUE
     WHERE c.case_number = $1`,
    [caseNumber]
  );
  const row = caseResult.rows[0];

  if (!row) return null;

  const [messagesResult, actionsResult] = await Promise.all([
    pool.query<CaseMessageRecord>(
      `SELECT
        id,
        sender_type,
        channel,
        message_text,
        internal_only,
        ai_generated,
        created_at::text
       FROM messages
       WHERE case_id = $1
       ORDER BY created_at ASC, id ASC`,
      [row.id]
    ),
    pool.query<CaseAgentActionRecord>(
      `SELECT
        id::text,
        action_type,
        status,
        source,
        confidence::text,
        reasoning_summary,
        metadata,
        executed_at::text,
        created_at::text
       FROM agent_actions
       WHERE case_id = $1
       ORDER BY created_at ASC, id ASC`,
      [row.id]
    ),
  ]);

  const account = row.account_id
    ? {
        id: row.account_id,
        name: row.account_name as string,
        industry: row.account_industry,
        plan: row.account_plan,
        stage: row.account_stage,
        health_status: row.account_health_status,
        owner_name: row.account_owner_name,
        metadata: row.account_metadata ?? {},
      }
    : null;

  return {
    case: {
      id: row.id,
      case_number: row.case_number,
      subject: row.subject,
      status: row.status,
      intent: row.intent,
      sentiment: row.sentiment,
      priority: row.priority,
      channel_origin: row.channel_origin,
      metadata: row.metadata,
      requires_human_review: row.requires_human_review,
      review_status: row.review_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_activity_at: row.last_activity_at,
      customer_name: row.customer_name,
      customer_email: row.customer_email,
    },
    account,
    messages: messagesResult.rows,
    agent_actions: actionsResult.rows,
    agent_decision: readAgentDecision(row.metadata),
  };
}
