import type { PoolClient } from "pg";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { findActionAutonomyPolicyForUpdate } from "./autonomy-policy.repository.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import * as policyAuditRepository from "./autonomy-policy-audit.repository.ts";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import * as policyValidation from "./autonomy-policy-validation.ts";
import type { ActionAutonomyPolicy } from "./autonomy-policy";
import type {
  ActionAutonomyPolicySnapshot,
} from "./autonomy-policy-audit.repository";
import type { PolicyUpdatePatch } from "./autonomy-policy-validation";

export type ActionAutonomyPolicyChangeRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type ActionAutonomyPolicyChangeRequestInput = {
  action_type: string;
  segment: string | null;
  old_policy: ActionAutonomyPolicySnapshot;
  proposed_policy: ActionAutonomyPolicySnapshot;
  patch: PolicyUpdatePatch;
  requested_by: string;
  request_reason: string;
};

export type ActionAutonomyPolicyChangeRequestRecord = {
  id: string;
  action_type: string;
  segment: string | null;
  old_policy: ActionAutonomyPolicySnapshot;
  proposed_policy: ActionAutonomyPolicySnapshot;
  patch: PolicyUpdatePatch;
  status: ActionAutonomyPolicyChangeRequestStatus;
  requested_by: string;
  request_reason: string;
  reviewed_by: string | null;
  review_reason: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type ListActionAutonomyPolicyChangeRequestsOptions = {
  status?: ActionAutonomyPolicyChangeRequestStatus;
  limit?: number;
};

type ActionAutonomyPolicyChangeRequestRow = {
  id: string | number;
  action_type: string;
  segment: string | null;
  old_policy: unknown;
  proposed_policy: unknown;
  patch: unknown;
  status: string;
  requested_by: string;
  request_reason: string;
  reviewed_by: string | null;
  review_reason: string | null;
  reviewed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const requestStatuses: ActionAutonomyPolicyChangeRequestStatus[] = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
];

const editableFields = [
  "tier",
  "confidence_floor",
  "max_blast_radius",
  "requires_reversible",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePatch(value: unknown): PolicyUpdatePatch | null {
  if (!isRecord(value)) return null;

  const unknownFields = Object.keys(value).filter(
    (field) => !editableFields.includes(field as (typeof editableFields)[number])
  );

  if (unknownFields.length > 0) return null;

  return value as PolicyUpdatePatch;
}

function normalizeRequestRow(
  row: ActionAutonomyPolicyChangeRequestRow
): ActionAutonomyPolicyChangeRequestRecord | null {
  const oldPolicy = policyAuditRepository.normalizeActionAutonomyPolicySnapshot(
    row.old_policy
  );
  const proposedPolicy =
    policyAuditRepository.normalizeActionAutonomyPolicySnapshot(
      row.proposed_policy
    );
  const patch = normalizePatch(row.patch);
  const reviewedAt =
    row.reviewed_at === null ? null : new Date(row.reviewed_at);
  const createdAt = new Date(row.created_at);
  const updatedAt = new Date(row.updated_at);

  if (
    !oldPolicy ||
    !proposedPolicy ||
    !patch ||
    !requestStatuses.includes(
      row.status as ActionAutonomyPolicyChangeRequestStatus
    ) ||
    (reviewedAt !== null && Number.isNaN(reviewedAt.getTime())) ||
    Number.isNaN(createdAt.getTime()) ||
    Number.isNaN(updatedAt.getTime())
  ) {
    return null;
  }

  return {
    id: String(row.id),
    action_type: row.action_type,
    segment: row.segment,
    old_policy: oldPolicy,
    proposed_policy: proposedPolicy,
    patch,
    status: row.status as ActionAutonomyPolicyChangeRequestStatus,
    requested_by: row.requested_by,
    request_reason: row.request_reason,
    reviewed_by: row.reviewed_by,
    review_reason: row.review_reason,
    reviewed_at: reviewedAt,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function requireReviewer(reviewedBy: string, reviewReason: string) {
  const normalizedReviewer = reviewedBy.trim();
  const normalizedReason = reviewReason.trim();
  const errors: string[] = [];

  if (!normalizedReviewer) errors.push("Reviewed by is required.");
  if (!normalizedReason) errors.push("Review reason is required.");

  if (errors.length > 0) {
    throw new ActionAutonomyPolicyChangeRequestValidationError(errors);
  }

  return {
    reviewedBy: normalizedReviewer,
    reviewReason: normalizedReason,
  };
}

function policiesMatchEditableFields(
  currentPolicy: ActionAutonomyPolicy,
  oldPolicy: ActionAutonomyPolicySnapshot
) {
  return editableFields.every(
    (field) => currentPolicy[field] === oldPolicy[field]
  );
}

function proposedPolicyMatchesPatch(
  currentPolicy: ActionAutonomyPolicy,
  patch: PolicyUpdatePatch,
  proposedPolicy: ActionAutonomyPolicySnapshot
) {
  const expectedPolicy = {
    ...currentPolicy,
    ...patch,
  };

  return editableFields.every(
    (field) => expectedPolicy[field] === proposedPolicy[field]
  );
}

export class ActionAutonomyPolicyChangeRequestNotFoundError extends Error {
  constructor(id: string) {
    super(`Autonomy policy change request ${id} was not found.`);
    this.name = "ActionAutonomyPolicyChangeRequestNotFoundError";
  }
}

export class ActionAutonomyPolicyChangeRequestStateError extends Error {
  constructor(id: string, status: string) {
    super(`Autonomy policy change request ${id} is ${status}, not pending.`);
    this.name = "ActionAutonomyPolicyChangeRequestStateError";
  }
}

export class ActionAutonomyPolicyChangeRequestDriftError extends Error {
  constructor(id: string) {
    super(
      `Autonomy policy change request ${id} cannot be approved because the policy has changed since it was requested.`
    );
    this.name = "ActionAutonomyPolicyChangeRequestDriftError";
  }
}

export class ActionAutonomyPolicyChangeRequestValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super("Autonomy policy change request review failed validation.");
    this.name = "ActionAutonomyPolicyChangeRequestValidationError";
    this.errors = errors;
  }
}

export class ActionAutonomyPolicyChangeRequestDataError extends Error {
  constructor(id: string) {
    super(
      `Autonomy policy change request ${id} contains an invalid stored policy snapshot.`
    );
    this.name = "ActionAutonomyPolicyChangeRequestDataError";
  }
}

export async function createActionAutonomyPolicyChangeRequest(
  client: PoolClient,
  input: ActionAutonomyPolicyChangeRequestInput
): Promise<ActionAutonomyPolicyChangeRequestRecord> {
  const result = await client.query<ActionAutonomyPolicyChangeRequestRow>(
    `INSERT INTO action_autonomy_policy_change_requests
      (
        action_type,
        segment,
        old_policy,
        proposed_policy,
        patch,
        requested_by,
        request_reason
      )
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7)
     RETURNING *`,
    [
      input.action_type,
      input.segment,
      JSON.stringify(input.old_policy),
      JSON.stringify(input.proposed_policy),
      JSON.stringify(input.patch),
      input.requested_by,
      input.request_reason,
    ]
  );

  const request = result.rows[0] ? normalizeRequestRow(result.rows[0]) : null;

  if (!request) {
    throw new Error("Policy change request insert did not return a valid row.");
  }

  await policyAuditRepository.insertActionAutonomyPolicyAudit(client, {
    action_type: request.action_type,
    segment: request.segment,
    old_policy: request.old_policy,
    new_policy: request.proposed_policy,
    change_type: "requested",
    changed_by: request.requested_by,
    change_reason: request.request_reason,
  });

  return request;
}

export async function listActionAutonomyPolicyChangeRequests(
  client: PoolClient,
  options: ListActionAutonomyPolicyChangeRequestsOptions = {}
): Promise<ActionAutonomyPolicyChangeRequestRecord[]> {
  const values: unknown[] = [];
  const clauses: string[] = [];

  if (options.status) {
    values.push(options.status);
    clauses.push(`status = $${values.length}`);
  }

  const limit = Math.max(1, Math.min(200, Math.trunc(options.limit ?? 50)));
  values.push(limit);

  const result = await client.query<ActionAutonomyPolicyChangeRequestRow>(
    `SELECT *
     FROM action_autonomy_policy_change_requests
     ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
     ORDER BY created_at DESC, id DESC
     LIMIT $${values.length}`,
    values
  );

  return result.rows.flatMap((row) => {
    const request = normalizeRequestRow(row);
    return request ? [request] : [];
  });
}

export async function getActionAutonomyPolicyChangeRequest(
  client: PoolClient,
  id: string
): Promise<ActionAutonomyPolicyChangeRequestRecord | null> {
  const result = await client.query<ActionAutonomyPolicyChangeRequestRow>(
    `SELECT *
     FROM action_autonomy_policy_change_requests
     WHERE id = $1`,
    [id]
  );

  const row = result.rows[0];
  if (!row) return null;

  const request = normalizeRequestRow(row);
  if (!request) {
    throw new ActionAutonomyPolicyChangeRequestDataError(id);
  }

  return request;
}

export async function getActionAutonomyPolicyChangeRequestForUpdate(
  client: PoolClient,
  id: string
): Promise<ActionAutonomyPolicyChangeRequestRecord | null> {
  const result = await client.query<ActionAutonomyPolicyChangeRequestRow>(
    `SELECT *
     FROM action_autonomy_policy_change_requests
     WHERE id = $1
     FOR UPDATE`,
    [id]
  );

  const row = result.rows[0];
  return row ? normalizeRequestRow(row) : null;
}

export async function approveActionAutonomyPolicyChangeRequest(
  client: PoolClient,
  input: {
    id: string;
    reviewed_by: string;
    review_reason: string;
  }
): Promise<{
  request: ActionAutonomyPolicyChangeRequestRecord;
  policy: ActionAutonomyPolicy;
}> {
  const reviewer = requireReviewer(input.reviewed_by, input.review_reason);
  const request = await getActionAutonomyPolicyChangeRequestForUpdate(
    client,
    input.id
  );

  if (!request) {
    throw new ActionAutonomyPolicyChangeRequestNotFoundError(input.id);
  }

  if (request.status !== "pending") {
    throw new ActionAutonomyPolicyChangeRequestStateError(
      request.id,
      request.status
    );
  }

  const currentPolicy = await findActionAutonomyPolicyForUpdate(
    client,
    request.action_type,
    request.segment
  );

  if (
    !currentPolicy ||
    !policiesMatchEditableFields(currentPolicy, request.old_policy)
  ) {
    throw new ActionAutonomyPolicyChangeRequestDriftError(request.id);
  }

  const validation = policyValidation.validatePolicyUpdate({
    existingPolicy: currentPolicy,
    patch: request.patch as Record<string, unknown>,
    changedBy: request.requested_by,
    changeReason: request.request_reason,
  });

  if (
    !validation.valid ||
    !proposedPolicyMatchesPatch(
      currentPolicy,
      validation.value.patch,
      request.proposed_policy
    )
  ) {
    throw new ActionAutonomyPolicyChangeRequestDriftError(request.id);
  }

  const policyResult = await client.query<{
    updated_at: Date | string;
  }>(
    `UPDATE action_autonomy_policy
     SET
       tier = $3,
       confidence_floor = $4,
       max_blast_radius = $5,
       requires_reversible = $6,
       updated_by = $7,
       updated_at = NOW()
     WHERE action_type = $1
       AND segment IS NOT DISTINCT FROM $2
     RETURNING updated_at`,
    [
      request.action_type,
      request.segment,
      request.proposed_policy.tier,
      request.proposed_policy.confidence_floor,
      request.proposed_policy.max_blast_radius,
      request.proposed_policy.requires_reversible,
      reviewer.reviewedBy,
    ]
  );
  const updatedAt = new Date(policyResult.rows[0]?.updated_at ?? Number.NaN);

  if (Number.isNaN(updatedAt.getTime())) {
    throw new Error("Approved policy update did not return a valid timestamp.");
  }

  const updatedPolicy: ActionAutonomyPolicy = {
    ...request.proposed_policy,
    updated_by: reviewer.reviewedBy,
    updated_at: updatedAt,
  };
  const requestResult =
    await client.query<ActionAutonomyPolicyChangeRequestRow>(
      `UPDATE action_autonomy_policy_change_requests
       SET
         status = 'approved',
         reviewed_by = $2,
         review_reason = $3,
         reviewed_at = NOW(),
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [request.id, reviewer.reviewedBy, reviewer.reviewReason]
    );
  const approvedRequest = requestResult.rows[0]
    ? normalizeRequestRow(requestResult.rows[0])
    : null;

  if (!approvedRequest) {
    throw new Error("Approved change request did not return a valid row.");
  }

  await policyAuditRepository.insertActionAutonomyPolicyAudit(client, {
    action_type: updatedPolicy.action_type,
    segment: updatedPolicy.segment,
    old_policy: currentPolicy,
    new_policy: updatedPolicy,
    change_type: "approved",
    changed_by: reviewer.reviewedBy,
    change_reason: reviewer.reviewReason,
  });

  return {
    request: approvedRequest,
    policy: updatedPolicy,
  };
}

export async function rejectActionAutonomyPolicyChangeRequest(
  client: PoolClient,
  input: {
    id: string;
    reviewed_by: string;
    review_reason: string;
  }
): Promise<ActionAutonomyPolicyChangeRequestRecord> {
  const reviewer = requireReviewer(input.reviewed_by, input.review_reason);
  const request = await getActionAutonomyPolicyChangeRequestForUpdate(
    client,
    input.id
  );

  if (!request) {
    throw new ActionAutonomyPolicyChangeRequestNotFoundError(input.id);
  }

  if (request.status !== "pending") {
    throw new ActionAutonomyPolicyChangeRequestStateError(
      request.id,
      request.status
    );
  }

  const result = await client.query<ActionAutonomyPolicyChangeRequestRow>(
    `UPDATE action_autonomy_policy_change_requests
     SET
       status = 'rejected',
       reviewed_by = $2,
       review_reason = $3,
       reviewed_at = NOW(),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [request.id, reviewer.reviewedBy, reviewer.reviewReason]
  );
  const rejectedRequest = result.rows[0]
    ? normalizeRequestRow(result.rows[0])
    : null;

  if (!rejectedRequest) {
    throw new Error("Rejected change request did not return a valid row.");
  }

  await policyAuditRepository.insertActionAutonomyPolicyAudit(client, {
    action_type: request.action_type,
    segment: request.segment,
    old_policy: request.old_policy,
    new_policy: request.proposed_policy,
    change_type: "rejected",
    changed_by: reviewer.reviewedBy,
    change_reason: reviewer.reviewReason,
  });

  return rejectedRequest;
}
