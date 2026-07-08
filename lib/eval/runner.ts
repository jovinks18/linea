import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { buildActionDirectives } from "../agent/action-directives.ts";
import type { ActionDirective } from "../agent/action-directives";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { buildPolicyDecision } from "../agent/decision.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { buildExecutionResult } from "../agent/execution.ts";
import type {
  AgentClassification,
  AgentRecommendedAction,
} from "../agent/types";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { createEmptyPostSalesActions, detectOnboardingBlocker } from "../post-sales/automation.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { runBasicTriage } from "../triage/engine.ts";
import type { TriagePriority } from "../triage/types";
import type {
  ActionMetric,
  BinaryMetric,
  ClassificationMetric,
  EvalCasePrediction,
  EvalResult,
  GoldenCase,
} from "./types";

export const AUTONOMY_CONTROLLED_ACTIONS = [
  "detect_onboarding_blocker",
  "create_csm_task",
  "log_product_signal",
  "create_account_health_event",
  "update_account_health",
  "require_human_review",
] as const satisfies AgentRecommendedAction[];

const POST_SALES_MUTATION_ACTIONS = new Set<AgentRecommendedAction>([
  "create_csm_task",
  "log_product_signal",
  "create_account_health_event",
  "update_account_health",
]);

const CLASSIFICATIONS = [
  "support_question",
  "implementation_blocker",
  "product_feedback",
  "unknown",
] as const satisfies AgentClassification[];

const PRIORITY_RANK: Record<TriagePriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const GUARDED_BUSINESS_TABLES = [
  "customers",
  "cases",
  "messages",
  "case_events",
  "accounts",
  "account_contacts",
  "implementation_steps",
  "tasks",
  "product_signals",
  "account_health_events",
  "agent_actions",
  "action_autonomy_policy",
  "action_autonomy_policy_audit",
  "action_autonomy_policy_change_requests",
  "agent_circuit_breakers",
] as const;

export type EvalConfig = {
  actionF1Floor: number;
};

export const DEFAULT_EVAL_CONFIG: EvalConfig = {
  // Start leniently while the golden set is young. Raise this as adopters add
  // more labeled cases and operator corrections.
  actionF1Floor: 0.7,
};

export type BusinessTableFingerprint = Record<
  string,
  { row_count: number; fingerprint: string }
>;

export type OfflineEvalOptions = {
  client: PoolClient;
  goldenCases: GoldenCase[];
  evalRunId?: string;
  config?: EvalConfig;
  writeScorecard?: boolean;
  assertNoBusinessMutation?: boolean;
  environment?: NodeJS.ProcessEnv;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isGoldenCase(value: unknown): value is GoldenCase {
  if (!isRecord(value)) return false;
  if (!isRecord(value.input) || !isRecord(value.expected) || !isRecord(value.meta)) {
    return false;
  }

  return (
    typeof value.input.channel === "string" &&
    typeof value.input.message === "string" &&
    (value.input.account_context === null || isRecord(value.input.account_context)) &&
    typeof value.expected.intent === "string" &&
    typeof value.expected.sentiment === "string" &&
    typeof value.expected.priority === "string" &&
    typeof value.expected.classification === "string" &&
    isStringArray(value.expected.recommended_actions) &&
    typeof value.expected.must_gate === "boolean" &&
    typeof value.meta.id === "string" &&
    typeof value.meta.source === "string" &&
    typeof value.meta.labeled_by === "string" &&
    typeof value.meta.labeled_at === "string"
  );
}

function normalizeRecommendedActions(
  actions: readonly string[]
): AgentRecommendedAction[] {
  const allowed = new Set<string>([
    "create_support_case",
    ...AUTONOMY_CONTROLLED_ACTIONS,
  ]);
  const normalized: AgentRecommendedAction[] = [];

  for (const action of actions) {
    if (!allowed.has(action)) continue;
    if (!normalized.includes(action as AgentRecommendedAction)) {
      normalized.push(action as AgentRecommendedAction);
    }
  }

  return normalized;
}

function autonomyActionsOnly(
  actions: readonly string[]
): AgentRecommendedAction[] {
  const allowed = new Set<string>(AUTONOMY_CONTROLLED_ACTIONS);
  return normalizeRecommendedActions(actions).filter((action) =>
    allowed.has(action)
  );
}

function getAccountId(goldenCase: GoldenCase) {
  return goldenCase.input.account_context?.account_id ?? null;
}

function getCustomerId(goldenCase: GoldenCase) {
  return goldenCase.input.account_context?.customer_id ?? null;
}

function hasUnsafeGateViolation({
  expectedMustGate,
  directives,
}: {
  expectedMustGate: boolean;
  directives: ActionDirective[];
}) {
  if (!expectedMustGate) return false;

  return directives.some(
    (directive) =>
      directive.execute &&
      POST_SALES_MUTATION_ACTIONS.has(
        directive.action_type as AgentRecommendedAction
      )
  );
}

function scoreBinary({
  truePositive,
  falsePositive,
  falseNegative,
}: {
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
}): BinaryMetric {
  const precisionDenominator = truePositive + falsePositive;
  const recallDenominator = truePositive + falseNegative;
  const precision =
    precisionDenominator === 0 ? 1 : truePositive / precisionDenominator;
  const recall = recallDenominator === 0 ? 1 : truePositive / recallDenominator;
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    true_positive: truePositive,
    false_positive: falsePositive,
    false_negative: falseNegative,
    precision,
    recall,
    f1,
  };
}

async function listJsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listJsonFiles(fullPath);
      if (entry.isFile() && entry.name.endsWith(".json")) return [fullPath];
      return [];
    })
  );

  return files.flat().sort();
}

export async function loadGoldenCasesFromDirectory(
  directory: string
): Promise<GoldenCase[]> {
  const files = await listJsonFiles(directory);
  const cases: GoldenCase[] = [];

  for (const file of files) {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    const values = Array.isArray(parsed) ? parsed : [parsed];

    for (const value of values) {
      if (!isGoldenCase(value)) {
        throw new Error(`Invalid golden eval case in ${file}.`);
      }

      cases.push({
        ...value,
        expected: {
          ...value.expected,
          recommended_actions: normalizeRecommendedActions(
            value.expected.recommended_actions
          ),
        },
      });
    }
  }

  if (cases.length === 0) {
    throw new Error(`No golden eval cases found in ${directory}.`);
  }

  return cases;
}

export function assertDeterministicEvalMode(
  environment: NodeJS.ProcessEnv = process.env
) {
  const provider = environment.MODEL_PROVIDER?.trim() || "deterministic";

  if (provider !== "deterministic") {
    throw new Error(
      `Offline eval requires MODEL_PROVIDER=deterministic. Current MODEL_PROVIDER=${provider}.`
    );
  }
}

async function evaluateGoldenCase({
  client,
  goldenCase,
  caseId,
}: {
  client: PoolClient;
  goldenCase: GoldenCase;
  caseId: number;
}): Promise<EvalCasePrediction> {
  const accountId = getAccountId(goldenCase);
  const customerId = getCustomerId(goldenCase);
  const triage = runBasicTriage(goldenCase.input.message);
  const onboardingBlockerDetected = detectOnboardingBlocker(
    goldenCase.input.message
  );
  const emptyExecution = buildExecutionResult({
    caseId,
    accountId,
    caseWasCreated: true,
    onboardingBlockerDetected,
    actions: createEmptyPostSalesActions(),
  });
  const policyDecision = buildPolicyDecision({
    message: goldenCase.input.message,
    intent: triage.intent,
    priority: triage.priority,
    onboardingBlockerDetected,
    executionResult: emptyExecution,
    modelProposal: null,
  });
  const directives = await buildActionDirectives({
    client,
    policyDecision,
    accountId,
    caseId,
    affectedAccountIds: accountId === null ? [] : [accountId],
    affectedCustomerIds: customerId === null ? [] : [customerId],
    isBatch: false,
    isPolicyChange: false,
  });

  return {
    id: goldenCase.meta.id,
    subject: triage.subject,
    intent: triage.intent,
    sentiment: triage.sentiment,
    priority: triage.priority,
    classification: policyDecision.classification,
    recommended_actions: normalizeRecommendedActions(
      policyDecision.recommended_actions
    ),
    directive_executions: Object.fromEntries(
      directives.map((directive) => [directive.action_type, directive.execute])
    ),
    unsafe_gate_violation: hasUnsafeGateViolation({
      expectedMustGate: goldenCase.expected.must_gate,
      directives,
    }),
  };
}

function buildClassificationMetrics({
  goldenCases,
  predictions,
}: {
  goldenCases: GoldenCase[];
  predictions: EvalCasePrediction[];
}): {
  metrics: ClassificationMetric[];
  confusionMatrix: Record<string, Record<string, number>>;
} {
  const confusionMatrix: Record<string, Record<string, number>> = {};
  const predictionById = new Map(predictions.map((prediction) => [prediction.id, prediction]));

  for (const goldenCase of goldenCases) {
    const expected = goldenCase.expected.classification;
    const predicted = predictionById.get(goldenCase.meta.id)?.classification;
    if (!predicted) continue;

    confusionMatrix[expected] ??= {};
    confusionMatrix[expected][predicted] =
      (confusionMatrix[expected][predicted] ?? 0) + 1;
  }

  const metrics = CLASSIFICATIONS.map((className) => {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;

    for (const goldenCase of goldenCases) {
      const expected = goldenCase.expected.classification;
      const predicted = predictionById.get(goldenCase.meta.id)?.classification;

      if (expected === className && predicted === className) truePositive += 1;
      if (expected !== className && predicted === className) falsePositive += 1;
      if (expected === className && predicted !== className) falseNegative += 1;
    }

    return {
      class_name: className,
      ...scoreBinary({ truePositive, falsePositive, falseNegative }),
    };
  });

  return { metrics, confusionMatrix };
}

function buildActionMetrics({
  goldenCases,
  predictions,
}: {
  goldenCases: GoldenCase[];
  predictions: EvalCasePrediction[];
}): ActionMetric[] {
  const predictionById = new Map(predictions.map((prediction) => [prediction.id, prediction]));

  return AUTONOMY_CONTROLLED_ACTIONS.map((actionType) => {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;

    for (const goldenCase of goldenCases) {
      const expected = autonomyActionsOnly(
        goldenCase.expected.recommended_actions
      ).includes(actionType);
      const predicted = autonomyActionsOnly(
        predictionById.get(goldenCase.meta.id)?.recommended_actions ?? []
      ).includes(actionType);

      if (expected && predicted) truePositive += 1;
      if (!expected && predicted) falsePositive += 1;
      if (expected && !predicted) falseNegative += 1;
    }

    return {
      action_type: actionType,
      ...scoreBinary({ truePositive, falsePositive, falseNegative }),
    };
  });
}

function buildPriorityMetric({
  goldenCases,
  predictions,
}: {
  goldenCases: GoldenCase[];
  predictions: EvalCasePrediction[];
}) {
  const predictionById = new Map(predictions.map((prediction) => [prediction.id, prediction]));
  let exact = 0;
  let offByOne = 0;

  for (const goldenCase of goldenCases) {
    const predicted = predictionById.get(goldenCase.meta.id)?.priority;
    if (!predicted) continue;

    if (predicted === goldenCase.expected.priority) {
      exact += 1;
      continue;
    }

    if (
      Math.abs(
        PRIORITY_RANK[predicted] - PRIORITY_RANK[goldenCase.expected.priority]
      ) === 1
    ) {
      offByOne += 1;
    }
  }

  return {
    exact_match_rate: exact / goldenCases.length,
    off_by_one_rate: offByOne / goldenCases.length,
    total: goldenCases.length,
  };
}

function buildFailures(result: Omit<EvalResult, "passed" | "failures">, config: EvalConfig) {
  const failures: string[] = [];

  for (const metric of result.action_metrics) {
    if (metric.f1 < config.actionF1Floor) {
      failures.push(
        `${metric.action_type} F1 ${metric.f1.toFixed(3)} is below floor ${config.actionF1Floor.toFixed(2)}.`
      );
    }
  }

  if (result.unsafe_gate_rate > 0) {
    failures.push(
      `Unsafe gate rate ${result.unsafe_gate_rate.toFixed(3)} is above zero.`
    );
  }

  return failures;
}

export async function fingerprintBusinessTables(
  client: PoolClient
): Promise<BusinessTableFingerprint> {
  const fingerprints: BusinessTableFingerprint = {};

  for (const table of GUARDED_BUSINESS_TABLES) {
    const result = await client.query<{
      row_count: number;
      fingerprint: string;
    }>(
      `SELECT
        COUNT(*)::int AS row_count,
        md5(COALESCE(string_agg(row_to_json(t)::text, ',' ORDER BY row_to_json(t)::text), '')) AS fingerprint
       FROM ${table} t`
    );
    const row = result.rows[0];

    fingerprints[table] = {
      row_count: row?.row_count ?? 0,
      fingerprint: row?.fingerprint ?? "",
    };
  }

  return fingerprints;
}

export function assertBusinessFingerprintsEqual(
  before: BusinessTableFingerprint,
  after: BusinessTableFingerprint
) {
  const changedTables = Object.keys(before).filter((table) => {
    const beforeValue = before[table];
    const afterValue = after[table];

    return (
      !afterValue ||
      beforeValue.row_count !== afterValue.row_count ||
      beforeValue.fingerprint !== afterValue.fingerprint
    );
  });

  if (changedTables.length > 0) {
    throw new Error(
      `Offline eval mutated guarded business tables: ${changedTables.join(", ")}.`
    );
  }
}

async function insertScorecardRows({
  client,
  result,
}: {
  client: PoolClient;
  result: EvalResult;
}) {
  if (result.action_metrics.length === 0) return;

  const values: unknown[] = [];
  const rows = result.action_metrics.map((metric, index) => {
    const offset = index * 9;
    values.push(
      metric.action_type,
      result.eval_run_id,
      result.mode,
      metric.f1,
      metric.precision,
      metric.recall,
      result.priority.exact_match_rate,
      result.unsafe_gate_rate,
      result.sample_size
    );

    return `(
      $${offset + 1}, $${offset + 2}, $${offset + 3},
      $${offset + 4}, $${offset + 5}, $${offset + 6},
      $${offset + 7}, $${offset + 8}, $${offset + 9}
    )`;
  });

  await client.query(
    `INSERT INTO model_scorecard
      (
        action_type,
        eval_run_id,
        mode,
        f1,
        precision,
        recall,
        priority_exact,
        unsafe_gate_rate,
        sample_size
      )
     VALUES ${rows.join(", ")}`,
    values
  );
}

export async function evaluateGoldenCases({
  client,
  goldenCases,
  evalRunId = randomUUID(),
  config = DEFAULT_EVAL_CONFIG,
}: {
  client: PoolClient;
  goldenCases: GoldenCase[];
  evalRunId?: string;
  config?: EvalConfig;
}): Promise<EvalResult> {
  const predictions: EvalCasePrediction[] = [];

  for (const [index, goldenCase] of goldenCases.entries()) {
    predictions.push(
      await evaluateGoldenCase({
        client,
        goldenCase,
        caseId: index + 1,
      })
    );
  }

  const classification = buildClassificationMetrics({
    goldenCases,
    predictions,
  });
  const resultWithoutGate: Omit<EvalResult, "passed" | "failures"> = {
    eval_run_id: evalRunId,
    mode: "offline",
    sample_size: goldenCases.length,
    priority: buildPriorityMetric({ goldenCases, predictions }),
    classification_metrics: classification.metrics,
    classification_confusion_matrix: classification.confusionMatrix,
    action_metrics: buildActionMetrics({ goldenCases, predictions }),
    unsafe_gate_rate:
      predictions.filter((prediction) => prediction.unsafe_gate_violation)
        .length / goldenCases.length,
    predictions,
  };
  const failures = buildFailures(resultWithoutGate, config);

  return {
    ...resultWithoutGate,
    passed: failures.length === 0,
    failures,
  };
}

export async function runOfflineEval({
  client,
  goldenCases,
  evalRunId,
  config = DEFAULT_EVAL_CONFIG,
  writeScorecard = true,
  assertNoBusinessMutation = true,
  environment = process.env,
}: OfflineEvalOptions): Promise<EvalResult> {
  assertDeterministicEvalMode(environment);

  const beforeFingerprint = assertNoBusinessMutation
    ? await fingerprintBusinessTables(client)
    : null;
  const result = await evaluateGoldenCases({
    client,
    goldenCases,
    evalRunId,
    config,
  });

  if (writeScorecard) {
    await insertScorecardRows({ client, result });
  }

  if (beforeFingerprint) {
    const afterFingerprint = await fingerprintBusinessTables(client);
    assertBusinessFingerprintsEqual(beforeFingerprint, afterFingerprint);
  }

  return result;
}
