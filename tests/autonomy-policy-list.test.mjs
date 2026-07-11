import assert from "node:assert/strict";
import {
  listActionAutonomyPolicies,
} from "../lib/agent/autonomy-policy.repository.ts";

const rows = [
  {
    action_type: "create_csm_task",
    segment: null,
    tier: "supervised",
    confidence_floor: "0.90",
    max_blast_radius: "1",
    requires_reversible: true,
    updated_by: "seed",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    action_type: "create_csm_task",
    segment: "linked_account",
    tier: "bounded",
    confidence_floor: 0.8,
    max_blast_radius: 1,
    requires_reversible: true,
    updated_by: null,
    updated_at: new Date("2026-02-01T00:00:00.000Z"),
  },
  {
    action_type: "create_support_case",
    segment: "linked_account",
    tier: "bounded",
    confidence_floor: 0.7,
    max_blast_radius: 1,
    requires_reversible: true,
    updated_by: "legacy_seed",
    updated_at: new Date("2026-02-01T00:00:00.000Z"),
  },
  {
    action_type: "require_human_review",
    segment: "unknown_account",
    tier: "bounded",
    confidence_floor: 0.9,
    max_blast_radius: 1,
    requires_reversible: true,
    updated_by: "legacy_seed",
    updated_at: new Date("2026-02-01T00:00:00.000Z"),
  },
];

const calls = [];
const client = {
  async query(sql, values) {
    calls.push({ sql, values });
    return { rows };
  },
};

const policies = await listActionAutonomyPolicies(client);

assert.equal(calls.length, 1);
assert.equal(calls[0].values, undefined);
assert.match(calls[0].sql, /action_type ASC/);
assert.match(
  calls[0].sql,
  /action_type NOT IN \('create_support_case', 'require_human_review'\)/
);
assert.match(calls[0].sql, /segment ASC NULLS FIRST/);
assert.match(calls[0].sql, /updated_at DESC/);

assert.equal(policies.length, 2);
assert.equal(policies[0].action_type, "create_csm_task");
assert.equal(policies[0].segment, null);
assert.equal(policies[0].confidence_floor, 0.9);
assert.equal(typeof policies[0].confidence_floor, "number");
assert.equal(policies[0].max_blast_radius, 1);
assert.equal(typeof policies[0].max_blast_radius, "number");
assert.ok(policies[0].updated_at instanceof Date);
assert.equal(
  policies[0].updated_at.toISOString(),
  "2026-01-01T00:00:00.000Z"
);
assert.equal(policies[1].segment, "linked_account");
assert.equal(policies[1].updated_by, null);
assert.ok(policies[1].updated_at instanceof Date);

console.log("PASS action autonomy policy list");
