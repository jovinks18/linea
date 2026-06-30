import type { PoolClient } from "pg";

export type CircuitBreakerSource = "none" | "manual" | "system";

export type CircuitBreakerState = {
  tripped: boolean;
  reasons: string[];
  breaker_keys: string[];
  source: CircuitBreakerSource;
};

export type CircuitBreakerContext = {
  actionType?: string;
  segment?: string;
  accountId?: number | null;
  lookbackMinutes?: number;
};

export type AgentCircuitBreakerRecord = {
  id: string;
  breaker_key: string;
  scope: string;
  status: "active" | "cleared";
  reason: string;
  triggered_by: string;
  triggered_at: Date;
  cleared_by: string | null;
  cleared_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type AgentCircuitBreakerRow = {
  id: string | number;
  breaker_key: string;
  scope: string;
  status: string;
  reason: string;
  triggered_by: string;
  triggered_at: Date | string;
  cleared_by: string | null;
  cleared_at: Date | string | null;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type CountRow = {
  count: string | number;
};

const DEFAULT_THRESHOLD = 3;
const DEFAULT_LOOKBACK_MINUTES = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBreakerRow(
  row: AgentCircuitBreakerRow
): AgentCircuitBreakerRecord | null {
  const triggeredAt = new Date(row.triggered_at);
  const clearedAt =
    row.cleared_at === null ? null : new Date(row.cleared_at);
  const createdAt = new Date(row.created_at);
  const updatedAt = new Date(row.updated_at);

  if (
    (row.status !== "active" && row.status !== "cleared") ||
    Number.isNaN(triggeredAt.getTime()) ||
    (clearedAt !== null && Number.isNaN(clearedAt.getTime())) ||
    Number.isNaN(createdAt.getTime()) ||
    Number.isNaN(updatedAt.getTime())
  ) {
    return null;
  }

  return {
    id: String(row.id),
    breaker_key: row.breaker_key,
    scope: row.scope,
    status: row.status,
    reason: row.reason,
    triggered_by: row.triggered_by,
    triggered_at: triggeredAt,
    cleared_by: row.cleared_by,
    cleared_at: clearedAt,
    metadata: isRecord(row.metadata) ? row.metadata : {},
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function normalizeLookback(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_LOOKBACK_MINUTES;
  return Math.max(1, Math.min(24 * 60, Math.trunc(value as number)));
}

function normalizeCount(row: CountRow | undefined) {
  const count = Number(row?.count ?? 0);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

export function getClearCircuitBreakerState(): CircuitBreakerState {
  return {
    tripped: false,
    reasons: [],
    breaker_keys: [],
    source: "none",
  };
}

export async function listActiveCircuitBreakers(
  client: PoolClient
): Promise<AgentCircuitBreakerRecord[]> {
  const result = await client.query<AgentCircuitBreakerRow>(
    `SELECT
       id,
       breaker_key,
       scope,
       status,
       reason,
       triggered_by,
       triggered_at,
       cleared_by,
       cleared_at,
       metadata,
       created_at,
       updated_at
     FROM agent_circuit_breakers
     WHERE status = 'active'
     ORDER BY triggered_at DESC, id DESC`
  );

  return result.rows.flatMap((row) => {
    const breaker = normalizeBreakerRow(row);
    return breaker ? [breaker] : [];
  });
}

export async function getCircuitBreakerState(
  client: PoolClient,
  context: CircuitBreakerContext = {}
): Promise<CircuitBreakerState> {
  const lookbackMinutes = normalizeLookback(context.lookbackMinutes);
  const scopes = Array.from(
    new Set(
      [
        "global",
        context.actionType,
        context.segment,
      ].filter((scope): scope is string => Boolean(scope))
    )
  );
  const reasons: string[] = [];
  const breakerKeys: string[] = [];

  const manualResult = await client.query<AgentCircuitBreakerRow>(
    `SELECT
       id,
       breaker_key,
       scope,
       status,
       reason,
       triggered_by,
       triggered_at,
       cleared_by,
       cleared_at,
       metadata,
       created_at,
       updated_at
     FROM agent_circuit_breakers
     WHERE status = 'active'
       AND scope = ANY($1::text[])
     ORDER BY triggered_at DESC, id DESC`,
    [scopes]
  );
  const manualBreakers = manualResult.rows.flatMap((row) => {
    const breaker = normalizeBreakerRow(row);
    return breaker ? [breaker] : [];
  });

  for (const breaker of manualBreakers) {
    reasons.push(`Manual breaker ${breaker.breaker_key}: ${breaker.reason}`);
    breakerKeys.push(breaker.breaker_key);
  }

  const failureValues: unknown[] = [lookbackMinutes];
  let failureActionClause = "";
  if (context.actionType) {
    failureValues.push(context.actionType);
    failureActionClause = "AND action_type = $2";
  }
  const failureResult = await client.query<CountRow>(
    `SELECT COUNT(*)::int AS count
     FROM agent_actions
     WHERE status = 'failed'
       AND created_at >= NOW() - ($1 * INTERVAL '1 minute')
       ${failureActionClause}`,
    failureValues
  );
  const recentFailures = normalizeCount(failureResult.rows[0]);

  if (recentFailures >= DEFAULT_THRESHOLD) {
    const key = `failure_rate:${context.actionType ?? "all_actions"}`;
    breakerKeys.push(key);
    reasons.push(
      `${recentFailures} failed agent actions occurred in the last ${lookbackMinutes} minutes.`
    );
  }

  const rejectionResult = await client.query<CountRow>(
    `SELECT COUNT(*)::int AS count
     FROM action_autonomy_policy_change_requests
     WHERE status = 'rejected'
       AND COALESCE(reviewed_at, updated_at, created_at)
         >= NOW() - ($1 * INTERVAL '1 minute')`,
    [lookbackMinutes]
  );
  const recentRejections = normalizeCount(rejectionResult.rows[0]);

  if (recentRejections >= DEFAULT_THRESHOLD) {
    breakerKeys.push("policy_rejection_spike");
    reasons.push(
      `${recentRejections} policy changes were rejected in the last ${lookbackMinutes} minutes.`
    );
  }

  // TODO: Trip from a connected sev-1 incident source.
  // TODO: Add an override-rate spike trigger scoped by action type.
  // TODO: Trip when measured model quality or F1 falls below the tier floor.

  const uniqueKeys = Array.from(new Set(breakerKeys));
  return {
    tripped: reasons.length > 0,
    reasons,
    breaker_keys: uniqueKeys,
    source:
      reasons.length === 0
        ? "none"
        : manualBreakers.length > 0
          ? "manual"
          : "system",
  };
}

export async function getCircuitBreakerStatesForActions(
  client: PoolClient,
  {
    actionTypes,
    segment,
    accountId,
    lookbackMinutes,
  }: {
    actionTypes: string[];
    segment: string;
    accountId: number | null;
    lookbackMinutes?: number;
  }
) {
  const states = new Map<string, CircuitBreakerState>();

  for (const actionType of new Set(actionTypes)) {
    states.set(
      actionType,
      await getCircuitBreakerState(client, {
        actionType,
        segment,
        accountId,
        lookbackMinutes,
      })
    );
  }

  return states;
}
