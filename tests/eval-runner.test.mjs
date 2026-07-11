import assert from "node:assert/strict";
import {
  assertBusinessFingerprintsEqual,
  assertDeterministicEvalMode,
  evaluateGoldenCases,
  loadGoldenCasesFromDirectory,
} from "../lib/eval/runner.ts";

function createPolicyRow(actionType, segment, tier, overrides = {}) {
  return {
    action_type: actionType,
    segment,
    tier,
    confidence_floor: overrides.confidence_floor ?? "0.80",
    max_blast_radius: 1,
    requires_reversible: overrides.requires_reversible ?? true,
    updated_by: "seed",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function createFakePolicyClient(rows) {
  return {
    async query(sql, values) {
      assert.match(sql, /action_autonomy_policy/);

      const [actionType, segment] = values;
      const expectsDefault = values.length === 1;
      const row = rows.find(
        (candidate) =>
          candidate.action_type === actionType &&
          (expectsDefault
            ? candidate.segment === null
            : candidate.segment === segment)
      );

      return { rows: row ? [row] : [] };
    },
  };
}

const seedLikePolicies = [
  createPolicyRow("create_csm_task", null, "bounded", {
    confidence_floor: "0.90",
  }),
  createPolicyRow("log_product_signal", null, "bounded", {
    confidence_floor: "0.90",
  }),
  createPolicyRow("create_account_health_event", null, "supervised", {
    confidence_floor: "0.90",
  }),
  createPolicyRow("update_account_health", null, "supervised", {
    confidence_floor: "0.90",
  }),
  createPolicyRow("detect_onboarding_blocker", "linked_account", "bounded"),
  createPolicyRow("create_csm_task", "linked_account", "bounded"),
  createPolicyRow("log_product_signal", "linked_account", "bounded"),
  createPolicyRow(
    "create_account_health_event",
    "linked_account",
    "bounded"
  ),
  createPolicyRow("update_account_health", "linked_account", "bounded", {
    requires_reversible: false,
  }),
  createPolicyRow(
    "detect_onboarding_blocker",
    "unknown_account",
    "supervised",
    { confidence_floor: "0.90" }
  ),
  createPolicyRow("create_csm_task", "unknown_account", "supervised", {
    confidence_floor: "0.90",
  }),
  createPolicyRow("log_product_signal", "unknown_account", "supervised", {
    confidence_floor: "0.90",
  }),
  createPolicyRow(
    "create_account_health_event",
    "unknown_account",
    "supervised",
    { confidence_floor: "0.90" }
  ),
  createPolicyRow("update_account_health", "unknown_account", "supervised", {
    confidence_floor: "0.90",
  }),
];

assert.doesNotThrow(() => assertDeterministicEvalMode({}));
assert.doesNotThrow(() =>
  assertDeterministicEvalMode({ MODEL_PROVIDER: "deterministic" })
);
assert.throws(
  () => assertDeterministicEvalMode({ MODEL_PROVIDER: "ollama" }),
  /requires MODEL_PROVIDER=deterministic/
);

assert.doesNotThrow(() =>
  assertBusinessFingerprintsEqual(
    { customers: { row_count: 1, fingerprint: "abc" } },
    { customers: { row_count: 1, fingerprint: "abc" } }
  )
);
assert.throws(
  () =>
    assertBusinessFingerprintsEqual(
      { customers: { row_count: 1, fingerprint: "abc" } },
      { customers: { row_count: 2, fingerprint: "def" } }
    ),
  /mutated guarded business tables: customers/
);

const goldenCases = await loadGoldenCasesFromDirectory("./lib/eval/golden");
assert.ok(goldenCases.length >= 25);
assert.ok(
  goldenCases.every(
    (goldenCase) =>
      goldenCase.input.account_context === null ||
      Number.isSafeInteger(goldenCase.input.account_context.account_id)
  )
);

const result = await evaluateGoldenCases({
  client: createFakePolicyClient(seedLikePolicies),
  goldenCases,
  evalRunId: "eval-test",
});

assert.equal(result.passed, true);
assert.deepEqual(result.failures, []);
assert.equal(result.unsafe_gate_rate, 0);
assert.ok(
  result.action_metrics.every(
    (metric) => metric.action_type !== "create_support_case"
  )
);
assert.ok(
  result.action_metrics.every((metric) => metric.f1 >= 0.7)
);

console.log("PASS offline eval runner");
