import assert from "node:assert/strict";
import {
  decide,
  getRestrictiveDefaultPolicy,
} from "../lib/agent/autonomy-policy.ts";

function createPolicy(tier, overrides = {}) {
  return {
    action_type: "create_support_case",
    segment: null,
    tier,
    confidence_floor: 0.9,
    max_blast_radius: 1,
    requires_reversible: true,
    updated_by: "test",
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function createProposal(overrides = {}) {
  return {
    action_type: "create_support_case",
    confidence: 0.95,
    blast_radius: 1,
    reversible: true,
    breaker_tripped: false,
    ...overrides,
  };
}

const cases = [
  {
    name: "shadow never executes",
    policy: createPolicy("shadow"),
    proposal: createProposal(),
    expected: {
      execute: false,
      status: "suggested",
      counterfactual: true,
      reason: "shadow",
    },
  },
  {
    name: "supervised enqueues review",
    policy: createPolicy("supervised"),
    proposal: createProposal(),
    expected: {
      execute: false,
      status: "suggested",
      enqueue_review: true,
      reason: "supervised",
    },
  },
  {
    name: "bounded executes inside all guards",
    policy: createPolicy("bounded"),
    proposal: createProposal(),
    expected: {
      execute: true,
      status: "executed",
    },
  },
  {
    name: "bounded rejects confidence below floor",
    policy: createPolicy("bounded"),
    proposal: createProposal({ confidence: 0.89 }),
    expected: {
      execute: false,
      status: "suggested",
      enqueue_review: true,
      reason: "out_of_bounds",
    },
  },
  {
    name: "bounded rejects blast radius above cap",
    policy: createPolicy("bounded"),
    proposal: createProposal({ blast_radius: 2 }),
    expected: {
      execute: false,
      status: "suggested",
      enqueue_review: true,
      reason: "out_of_bounds",
    },
  },
  {
    name: "bounded rejects a required non-reversible action",
    policy: createPolicy("bounded"),
    proposal: createProposal({ reversible: false }),
    expected: {
      execute: false,
      status: "suggested",
      enqueue_review: true,
      reason: "out_of_bounds",
    },
  },
  {
    name: "bounded rejects a tripped breaker",
    policy: createPolicy("bounded"),
    proposal: createProposal({ breaker_tripped: true }),
    expected: {
      execute: false,
      status: "suggested",
      enqueue_review: true,
      reason: "out_of_bounds",
    },
  },
  {
    name: "autonomous executes inside all guards",
    policy: createPolicy("autonomous"),
    proposal: createProposal(),
    expected: {
      execute: true,
      status: "executed",
    },
  },
  {
    name: "autonomous rejects a guard failure",
    policy: createPolicy("autonomous"),
    proposal: createProposal({ breaker_tripped: true }),
    expected: {
      execute: false,
      status: "suggested",
      enqueue_review: true,
      reason: "guard_failed",
    },
  },
];

for (const testCase of cases) {
  assert.deepEqual(
    decide(testCase.proposal, { policy: testCase.policy }),
    testCase.expected,
    testCase.name
  );
}

const restrictiveDefault = getRestrictiveDefaultPolicy(
  "unknown_external_action",
  "enterprise"
);

assert.equal(restrictiveDefault.tier, "supervised");
assert.equal(restrictiveDefault.action_type, "unknown_external_action");
assert.equal(restrictiveDefault.segment, "enterprise");

console.log("PASS action autonomy policy decisions");
