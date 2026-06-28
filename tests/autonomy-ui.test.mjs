import assert from "node:assert/strict";
import {
  getAutonomyBadges,
  getAutonomySummary,
} from "../lib/ui/autonomy.ts";

assert.equal(
  getAutonomySummary({
    status: "executed",
    metadata: {
      tier: "bounded",
      segment: "linked_account",
    },
  }),
  "Executed under bounded policy for linked account."
);

assert.equal(
  getAutonomySummary({
    status: "suggested",
    metadata: {
      tier: "supervised",
      reason: "supervised",
      enqueue_review: true,
    },
  }),
  "Suggested because this action requires supervision."
);

assert.equal(
  getAutonomySummary({
    status: "suggested",
    metadata: {
      tier: "shadow",
      reason: "shadow",
      counterfactual: true,
    },
  }),
  "Counterfactual only; no database mutation was performed."
);

assert.equal(
  getAutonomySummary({
    status: "suggested",
    metadata: {
      tier: "bounded",
      reason: "out_of_bounds",
      enqueue_review: true,
    },
  }),
  "Suggested because guard failed: out_of_bounds."
);

assert.equal(
  getAutonomySummary({ status: "executed", metadata: {} }),
  null
);
assert.deepEqual(getAutonomyBadges(undefined), []);
assert.deepEqual(
  getAutonomyBadges({
    tier: "supervised",
    counterfactual: true,
    enqueue_review: true,
  }),
  [
    { kind: "tier", label: "Supervised policy" },
    { kind: "counterfactual", label: "Counterfactual" },
    { kind: "review", label: "Review queued" },
  ]
);

console.log("PASS autonomy UI formatting");
