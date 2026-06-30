import assert from "node:assert/strict";
import {
  validatePolicyUpdate,
} from "../lib/agent/autonomy-policy-validation.ts";

function createPolicy(overrides = {}) {
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

function validate(patch, overrides = {}) {
  return validatePolicyUpdate({
    existingPolicy: createPolicy(overrides.existingPolicy),
    patch,
    changedBy:
      Object.hasOwn(overrides, "changedBy")
        ? overrides.changedBy
        : "operator",
    changeReason:
      Object.hasOwn(overrides, "changeReason")
        ? overrides.changeReason
        : "Synthetic policy review",
  });
}

{
  const result = validate(
    { confidence_floor: 0.85 },
    { changedBy: "   " }
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Changed by is required/);
}

{
  const result = validate(
    { confidence_floor: 0.85 },
    { changeReason: "" }
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Change reason is required/);
}

{
  const result = validate({ tier: "autonomous" });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Autonomous upgrades are disabled/);
}

{
  const result = validate({ confidence_floor: 0.5 });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /between 0.75 and 1.00/);
}

{
  const result = validate({ max_blast_radius: 2 });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /integer between 0 and 1/);
}

{
  const result = validate({ requires_reversible: false });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /not allowed/);
}

{
  const result = validate(
    { requires_reversible: false },
    {
      existingPolicy: {
        action_type: "update_account_health",
        segment: "linked_account",
      },
    }
  );
  assert.equal(result.valid, true);
  assert.equal(result.value.patch.requires_reversible, false);
}

{
  const result = validate({ confidence_floor: 0.8 });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /change at least one field/);
}

{
  const result = validate({
    confidence_floor: 0.85,
    unexpected_field: true,
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Unknown patch fields/);
}

{
  const result = validate({ tier: "supervised", confidence_floor: "0.85" });
  assert.equal(result.valid, true);
  assert.deepEqual(result.value.patch, {
    tier: "supervised",
    confidence_floor: 0.85,
  });
  assert.equal(result.value.changedBy, "operator");
  assert.equal(result.value.changeReason, "Synthetic policy review");
}

console.log("PASS action autonomy policy update validation");
