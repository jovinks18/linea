import type { PoolClient } from "pg";

export type ModelScorecardEvidence = {
  action_type: string;
  eval_run_id: string;
  f1: number;
  precision: number;
  recall: number;
  priority_exact: number;
  unsafe_gate_rate: number;
  sample_size: number;
  computed_at: Date;
};

type ModelScorecardRow = {
  action_type: string;
  eval_run_id: string;
  f1: string | number;
  precision: string | number;
  recall: string | number;
  priority_exact: string | number;
  unsafe_gate_rate: string | number;
  sample_size: string | number;
  computed_at: Date | string;
};

function normalizeScorecardRow(
  row: ModelScorecardRow
): ModelScorecardEvidence | null {
  const f1 = Number(row.f1);
  const precision = Number(row.precision);
  const recall = Number(row.recall);
  const priorityExact = Number(row.priority_exact);
  const unsafeGateRate = Number(row.unsafe_gate_rate);
  const sampleSize = Number(row.sample_size);
  const computedAt = new Date(row.computed_at);

  if (
    !row.action_type ||
    !row.eval_run_id ||
    !Number.isFinite(f1) ||
    !Number.isFinite(precision) ||
    !Number.isFinite(recall) ||
    !Number.isFinite(priorityExact) ||
    !Number.isFinite(unsafeGateRate) ||
    !Number.isInteger(sampleSize) ||
    Number.isNaN(computedAt.getTime())
  ) {
    return null;
  }

  return {
    action_type: row.action_type,
    eval_run_id: row.eval_run_id,
    f1,
    precision,
    recall,
    priority_exact: priorityExact,
    unsafe_gate_rate: unsafeGateRate,
    sample_size: sampleSize,
    computed_at: computedAt,
  };
}

export async function listLatestModelScorecardsByActionType(
  client: PoolClient
): Promise<Map<string, ModelScorecardEvidence>> {
  const result = await client.query<ModelScorecardRow>(
    `SELECT DISTINCT ON (action_type)
      action_type,
      eval_run_id,
      f1,
      precision,
      recall,
      priority_exact,
      unsafe_gate_rate,
      sample_size,
      computed_at
     FROM model_scorecard
     ORDER BY action_type ASC, computed_at DESC, id DESC`
  );

  const scorecards = new Map<string, ModelScorecardEvidence>();

  for (const row of result.rows) {
    const scorecard = normalizeScorecardRow(row);
    if (scorecard) scorecards.set(scorecard.action_type, scorecard);
  }

  return scorecards;
}
