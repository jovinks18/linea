import type { PoolClient } from "pg";
import type { AgentActionStatus } from "./repository";

export type AgentActionSimulationRecord = {
  id: string;
  case_id: number | null;
  case_number: string | null;
  account_id: number | null;
  action_type: string;
  status: AgentActionStatus;
  confidence: number | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

export type ListRecentAgentActionsForSimulationOptions = {
  actionType: string;
  segment?: string | null;
  limit?: number;
};

type AgentActionSimulationRow = {
  id: string | number;
  case_id: string | number | null;
  case_number: string | null;
  account_id: string | number | null;
  action_type: string;
  status: string;
  confidence: string | number | null;
  metadata: unknown;
  created_at: Date | string;
};

const actionStatuses: AgentActionStatus[] = [
  "executed",
  "suggested",
  "skipped",
  "failed",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNullableId(value: string | number | null) {
  if (value === null) return null;
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) ? normalized : null;
}

function normalizeRow(
  row: AgentActionSimulationRow
): AgentActionSimulationRecord | null {
  const createdAt = new Date(row.created_at);
  const confidence =
    row.confidence === null ? null : Number(row.confidence);

  if (
    !actionStatuses.includes(row.status as AgentActionStatus) ||
    Number.isNaN(createdAt.getTime()) ||
    (confidence !== null && !Number.isFinite(confidence))
  ) {
    return null;
  }

  return {
    id: String(row.id),
    case_id: normalizeNullableId(row.case_id),
    case_number: row.case_number,
    account_id: normalizeNullableId(row.account_id),
    action_type: row.action_type,
    status: row.status as AgentActionStatus,
    confidence,
    metadata: isRecord(row.metadata) ? row.metadata : {},
    created_at: createdAt,
  };
}

export async function listRecentAgentActionsForSimulation(
  client: PoolClient,
  options: ListRecentAgentActionsForSimulationOptions
): Promise<AgentActionSimulationRecord[]> {
  const values: unknown[] = [options.actionType];
  const clauses = ["aa.action_type = $1"];

  if (options.segment !== null && options.segment !== undefined) {
    values.push(options.segment);
    clauses.push(`aa.metadata->>'segment' = $${values.length}`);
  }

  const limit = Math.max(1, Math.min(500, Math.trunc(options.limit ?? 100)));
  values.push(limit);

  const result = await client.query<AgentActionSimulationRow>(
    `SELECT
       aa.id,
       aa.case_id,
       c.case_number,
       aa.account_id,
       aa.action_type,
       aa.status,
       aa.confidence,
       aa.metadata,
       aa.created_at
     FROM agent_actions aa
     LEFT JOIN cases c ON c.id = aa.case_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY aa.created_at DESC, aa.id DESC
     LIMIT $${values.length}`,
    values
  );

  return result.rows.flatMap((row) => {
    const normalized = normalizeRow(row);
    return normalized ? [normalized] : [];
  });
}
