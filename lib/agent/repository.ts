import type { Pool, PoolClient } from "pg";
import type { AgentActionName, AgentDecisionSource } from "./types";

export type AgentActionStatus =
  | "executed"
  | "suggested"
  | "skipped"
  | "failed";

export type AgentActionType = AgentActionName;

export type AgentActionInput = {
  case_id: number | null;
  account_id: number | null;
  action_type: AgentActionType;
  status: AgentActionStatus;
  source: AgentDecisionSource;
  confidence: number | null;
  reasoning_summary: string | null;
  metadata: Record<string, unknown>;
  executed_at: Date | null;
};

export type AgentActionRecord = {
  id: string;
};

export async function insertAgentAction(
  client: PoolClient,
  input: AgentActionInput
): Promise<AgentActionRecord> {
  const [record] = await insertAgentActions(client, [input]);
  return record;
}

export async function insertAgentActions(
  client: PoolClient,
  inputs: AgentActionInput[]
): Promise<AgentActionRecord[]> {
  if (inputs.length === 0) return [];

  const values: unknown[] = [];
  const rows = inputs.map((input, index) => {
    const offset = index * 9;

    values.push(
      input.case_id,
      input.account_id,
      input.action_type,
      input.status,
      input.source,
      input.confidence,
      input.reasoning_summary,
      JSON.stringify(input.metadata),
      input.executed_at
    );

    return `(
      $${offset + 1}, $${offset + 2}, $${offset + 3},
      $${offset + 4}, $${offset + 5}, $${offset + 6},
      $${offset + 7}, $${offset + 8}, $${offset + 9}
    )`;
  });

  const result = await client.query<AgentActionRecord>(
    `INSERT INTO agent_actions
      (
        case_id,
        account_id,
        action_type,
        status,
        source,
        confidence,
        reasoning_summary,
        metadata,
        executed_at
      )
     VALUES ${rows.join(", ")}
     RETURNING id`,
    values
  );

  return result.rows;
}

export async function insertAgentActionDurably(
  database: Pick<Pool, "connect">,
  input: AgentActionInput
): Promise<AgentActionRecord> {
  const auditClient = await database.connect();

  try {
    return await insertAgentAction(auditClient, input);
  } finally {
    auditClient.release();
  }
}
