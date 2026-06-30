import assert from "node:assert/strict";
import {
  classifyPolicyChangeRisk,
  validatePolicyUpdate,
} from "../lib/agent/autonomy-policy-validation.ts";

function policy(overrides = {}) {
  return {
    action_type: "create_csm_task",
    segment: "linked_account",
    tier: "bounded",
    confidence_floor: 0.8,
    max_blast_radius: 1,
    requires_reversible: true,
    updated_by: "seed",
    updated_at: new Date("2026-06-28T00:00:00.000Z"),
    ...overrides,
  };
}

function risk(existingPolicy, normalizedPatch) {
  return classifyPolicyChangeRisk({ existingPolicy, normalizedPatch });
}

assert.equal(
  risk(policy({ confidence_floor: 0.9 }), {
    confidence_floor: 0.85,
  }).risky,
  true
);
assert.equal(
  risk(policy({ confidence_floor: 0.8 }), {
    confidence_floor: 0.9,
  }).risky,
  false
);
assert.equal(
  risk(policy({ max_blast_radius: 0 }), {
    max_blast_radius: 1,
  }).risky,
  true
);
assert.equal(
  risk(policy({ max_blast_radius: 1 }), {
    max_blast_radius: 0,
  }).risky,
  false
);
assert.equal(
  risk(policy({ tier: "supervised" }), { tier: "bounded" }).risky,
  true
);
assert.equal(
  risk(policy({ tier: "bounded" }), { tier: "supervised" }).risky,
  false
);
assert.equal(
  risk(
    policy({
      action_type: "update_account_health",
      requires_reversible: true,
    }),
    { requires_reversible: false }
  ).risky,
  true
);
assert.equal(
  risk(
    policy({
      action_type: "update_account_health",
      requires_reversible: false,
    }),
    { requires_reversible: true }
  ).risky,
  false
);

const autonomousValidation = validatePolicyUpdate({
  existingPolicy: policy(),
  patch: { tier: "autonomous" },
  changedBy: "operator",
  changeReason: "Unsafe test",
});
assert.equal(autonomousValidation.valid, false);
assert.match(
  autonomousValidation.errors.join(" "),
  /Autonomous upgrades are disabled/
);

console.log("PASS action autonomy policy risk classification");
