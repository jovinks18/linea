import assert from "node:assert/strict";
import {
  ActionAutonomyPolicyChangeRequestDriftError,
  ActionAutonomyPolicyChangeRequestStateError,
  ActionAutonomyPolicyChangeRequestValidationError,
  approveActionAutonomyPolicyChangeRequest,
  createActionAutonomyPolicyChangeRequest,
  rejectActionAutonomyPolicyChangeRequest,
} from "../lib/agent/autonomy-policy-change-request.repository.ts";
import {
  submitActionAutonomyPolicyChange,
} from "../lib/agent/autonomy-policy-change-service.ts";
import {
  resolveActionAutonomyPolicy,
} from "../lib/agent/autonomy-policy.repository.ts";

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

function policyRow(overrides = {}) {
  const value = policy(overrides);
  return {
    ...value,
    confidence_floor: String(value.confidence_floor),
    updated_at: value.updated_at.toISOString(),
  };
}

function requestRow({
  id = "10",
  oldPolicy = policy(),
  proposedPolicy = policy({ confidence_floor: 0.75 }),
  patch = { confidence_floor: 0.75 },
  status = "pending",
  reviewedBy = null,
  reviewReason = null,
  reviewedAt = null,
} = {}) {
  return {
    id,
    action_type: oldPolicy.action_type,
    segment: oldPolicy.segment,
    old_policy: oldPolicy,
    proposed_policy: proposedPolicy,
    patch,
    status,
    requested_by: "operator",
    request_reason: "Lower threshold for synthetic test",
    reviewed_by: reviewedBy,
    review_reason: reviewReason,
    reviewed_at: reviewedAt,
    created_at: "2026-06-29T00:00:00.000Z",
    updated_at: "2026-06-29T00:00:00.000Z",
  };
}

function createClient({
  currentPolicy = policy(),
  changeRequest = requestRow(),
} = {}) {
  const calls = [];
  let storedPolicy = { ...currentPolicy };
  let storedRequest = changeRequest ? { ...changeRequest } : null;
  let requestId = 10;
  let auditId = 20;

  return {
    calls,
    get policy() {
      return storedPolicy;
    },
    async query(sql, values = []) {
      calls.push({ sql, values });

      if (
        sql.includes("FROM action_autonomy_policy_change_requests") &&
        sql.includes("FOR UPDATE")
      ) {
        return { rows: storedRequest ? [storedRequest] : [] };
      }

      if (
        sql.includes("FROM action_autonomy_policy") &&
        sql.includes("FOR UPDATE")
      ) {
        return { rows: [policyRow(storedPolicy)] };
      }

      if (
        sql.includes("FROM action_autonomy_policy") &&
        !sql.includes("FOR UPDATE")
      ) {
        return { rows: [policyRow(storedPolicy)] };
      }

      if (sql.includes("INSERT INTO action_autonomy_policy_change_requests")) {
        requestId += 1;
        storedRequest = requestRow({
          id: String(requestId),
          oldPolicy: JSON.parse(values[2]),
          proposedPolicy: JSON.parse(values[3]),
          patch: JSON.parse(values[4]),
        });
        return { rows: [storedRequest] };
      }

      if (sql.includes("UPDATE action_autonomy_policy_change_requests")) {
        const approved = sql.includes("status = 'approved'");
        storedRequest = {
          ...storedRequest,
          status: approved ? "approved" : "rejected",
          reviewed_by: values[1],
          review_reason: values[2],
          reviewed_at: "2026-06-29T01:00:00.000Z",
          updated_at: "2026-06-29T01:00:00.000Z",
        };
        return { rows: [storedRequest] };
      }

      if (sql.includes("UPDATE action_autonomy_policy")) {
        storedPolicy = {
          ...storedPolicy,
          tier: values[2],
          confidence_floor: Number(values[3]),
          max_blast_radius: Number(values[4]),
          requires_reversible: values[5],
          updated_by: values[6],
          updated_at: new Date("2026-06-29T01:00:00.000Z"),
        };

        if (sql.includes("RETURNING updated_at")) {
          return { rows: [{ updated_at: storedPolicy.updated_at }] };
        }

        return { rows: [policyRow(storedPolicy)] };
      }

      if (sql.includes("INSERT INTO action_autonomy_policy_audit")) {
        auditId += 1;
        return { rows: [{ id: String(auditId) }] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

{
  const client = createClient({ changeRequest: null });
  const result = await submitActionAutonomyPolicyChange(client, {
    action_type: "create_csm_task",
    segment: "linked_account",
    patch: { confidence_floor: 0.75 },
    changed_by: "operator",
    change_reason: "Lower threshold for synthetic test",
  });

  assert.equal(result.mode, "pending_approval");
  assert.equal(client.policy.confidence_floor, 0.8);
  assert.equal(
    client.calls.filter((call) =>
      /^\s*UPDATE action_autonomy_policy\s/.test(call.sql)
    ).length,
    0
  );
  assert.equal(
    client.calls.filter((call) =>
      call.sql.includes("INSERT INTO action_autonomy_policy_change_requests")
    ).length,
    1
  );
  assert.equal(
    client.calls.find((call) =>
      call.sql.includes("INSERT INTO action_autonomy_policy_audit")
    ).values[4],
    "requested"
  );

  const resolvedPolicy = await resolveActionAutonomyPolicy(
    client,
    "create_csm_task",
    "linked_account"
  );
  assert.equal(resolvedPolicy.confidence_floor, 0.8);
}

{
  const client = createClient({
    currentPolicy: policy({ confidence_floor: 0.8 }),
    changeRequest: null,
  });
  const result = await submitActionAutonomyPolicyChange(client, {
    action_type: "create_csm_task",
    segment: "linked_account",
    patch: { confidence_floor: 0.9 },
    changed_by: "operator",
    change_reason: "Raise threshold for synthetic test",
  });

  assert.equal(result.mode, "applied");
  assert.equal(result.policy.confidence_floor, 0.9);
  assert.equal(
    client.calls.filter((call) =>
      call.sql.includes("INSERT INTO action_autonomy_policy_change_requests")
    ).length,
    0
  );
  assert.equal(
    client.calls.find((call) =>
      call.sql.includes("INSERT INTO action_autonomy_policy_audit")
    ).values[4],
    "updated"
  );
}

{
  const client = createClient();
  const result = await approveActionAutonomyPolicyChangeRequest(client, {
    id: "10",
    reviewed_by: "approver",
    review_reason: "Approved synthetic request",
  });

  assert.equal(result.request.status, "approved");
  assert.equal(result.policy.confidence_floor, 0.75);
  assert.equal(client.policy.confidence_floor, 0.75);
  assert.equal(
    client.calls.find((call) =>
      call.sql.includes("INSERT INTO action_autonomy_policy_audit")
    ).values[4],
    "approved"
  );
}

{
  const client = createClient();
  const result = await rejectActionAutonomyPolicyChangeRequest(client, {
    id: "10",
    reviewed_by: "approver",
    review_reason: "Rejected synthetic request",
  });

  assert.equal(result.status, "rejected");
  assert.equal(client.policy.confidence_floor, 0.8);
  assert.equal(
    client.calls.filter((call) =>
      /^\s*UPDATE action_autonomy_policy\s/.test(call.sql)
    ).length,
    0
  );
  assert.equal(
    client.calls.find((call) =>
      call.sql.includes("INSERT INTO action_autonomy_policy_audit")
    ).values[4],
    "rejected"
  );
}

{
  const client = createClient({
    currentPolicy: policy({ confidence_floor: 0.9 }),
  });

  await assert.rejects(
    approveActionAutonomyPolicyChangeRequest(client, {
      id: "10",
      reviewed_by: "approver",
      review_reason: "Stale synthetic request",
    }),
    ActionAutonomyPolicyChangeRequestDriftError
  );

  assert.equal(
    client.calls.filter((call) =>
      /^\s*UPDATE action_autonomy_policy\s/.test(call.sql)
    ).length,
    0
  );
}

{
  const client = createClient({
    changeRequest: requestRow({ status: "approved" }),
  });

  await assert.rejects(
    approveActionAutonomyPolicyChangeRequest(client, {
      id: "10",
      reviewed_by: "approver",
      review_reason: "Duplicate approval",
    }),
    ActionAutonomyPolicyChangeRequestStateError
  );
}

{
  const client = createClient();

  await assert.rejects(
    rejectActionAutonomyPolicyChangeRequest(client, {
      id: "10",
      reviewed_by: "",
      review_reason: "",
    }),
    ActionAutonomyPolicyChangeRequestValidationError
  );
  assert.equal(client.calls.length, 0);
}

{
  const client = createClient({ changeRequest: null });
  const created = await createActionAutonomyPolicyChangeRequest(client, {
    action_type: "create_csm_task",
    segment: "linked_account",
    old_policy: policy(),
    proposed_policy: policy({ confidence_floor: 0.75 }),
    patch: { confidence_floor: 0.75 },
    requested_by: "operator",
    request_reason: "Direct synthetic request",
  });

  assert.equal(created.status, "pending");
}

console.log("PASS action autonomy policy change requests");
