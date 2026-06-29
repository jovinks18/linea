import type { PoolClient } from "pg";
import type { AutonomyTier } from "./autonomy-policy";

export type ActionAutonomyPolicySnapshot = {
  action_type: string;
  segment: string | null;
  tier: AutonomyTier;
  confidence_floor: number;
  max_blast_radius: number;
  requires_reversible: boolean;
  updated_by: string | null;
  updated_at: Date;
};

export type ActionAutonomyPolicyChangeType =
  | "created"
  | "updated"
  | "deleted"
  | "seeded";

export type ActionAutonomyPolicyAuditInput = {
  action_type: string;
  segment: string | null;
  old_policy: ActionAutonomyPolicySnapshot | null;
  new_policy: ActionAutonomyPolicySnapshot;
  change_type: ActionAutonomyPolicyChangeType;
  changed_by: string;
  change_reason: string | null;
};

export type ActionAutonomyPolicyAuditRecord = {
  id: string;
  action_type: string;
  segment: string | null;
  old_policy: ActionAutonomyPolicySnapshot | null;
  new_policy: ActionAutonomyPolicySnapshot;
  change_type: ActionAutonomyPolicyChangeType;
  changed_by: string;
  change_reason: string | null;
  created_at: Date;
};

export type ListActionAutonomyPolicyAuditsOptions = {
  limit?: number;
  actionType?: string;
  segment?: string | null;
  changeType?: ActionAutonomyPolicyChangeType;
};

type ActionAutonomyPolicyAuditRow = {
  id: string | number;
  action_type: string;
  segment: string | null;
  old_policy: unknown;
  new_policy: unknown;
  change_type: string;
  changed_by: string;
  change_reason: string | null;
  created_at: Date | string;
};

const autonomyTiers: AutonomyTier[] = [
  "shadow",
  "supervised",
  "bounded",
  "autonomous",
];

const changeTypes: ActionAutonomyPolicyChangeType[] = [
  "created",
  "updated",
  "deleted",
  "seeded",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAutonomyTier(value: unknown): value is AutonomyTier {
  return (
    typeof value === "string" &&
    autonomyTiers.includes(value as AutonomyTier)
  );
}

function isChangeType(
  value: string
): value is ActionAutonomyPolicyChangeType {
  return changeTypes.includes(value as ActionAutonomyPolicyChangeType);
}

function normalizeSnapshot(
  value: unknown
): ActionAutonomyPolicySnapshot | null {
  if (!isRecord(value)) return null;

  const confidenceFloor = Number(value.confidence_floor);
  const maxBlastRadius = Number(value.max_blast_radius);
  const updatedAt = new Date(String(value.updated_at));

  if (
    typeof value.action_type !== "string" ||
    (value.segment !== null && typeof value.segment !== "string") ||
    !isAutonomyTier(value.tier) ||
    !Number.isFinite(confidenceFloor) ||
    !Number.isFinite(maxBlastRadius) ||
    typeof value.requires_reversible !== "boolean" ||
    (value.updated_by !== null && typeof value.updated_by !== "string") ||
    Number.isNaN(updatedAt.getTime())
  ) {
    return null;
  }

  return {
    action_type: value.action_type,
    segment: value.segment,
    tier: value.tier,
    confidence_floor: confidenceFloor,
    max_blast_radius: maxBlastRadius,
    requires_reversible: value.requires_reversible,
    updated_by: value.updated_by,
    updated_at: updatedAt,
  };
}

function normalizeAuditRow(
  row: ActionAutonomyPolicyAuditRow
): ActionAutonomyPolicyAuditRecord | null {
  const oldPolicy =
    row.old_policy === null ? null : normalizeSnapshot(row.old_policy);
  const newPolicy = normalizeSnapshot(row.new_policy);
  const createdAt = new Date(row.created_at);

  if (
    (row.old_policy !== null && oldPolicy === null) ||
    newPolicy === null ||
    !isChangeType(row.change_type) ||
    Number.isNaN(createdAt.getTime())
  ) {
    return null;
  }

  return {
    id: String(row.id),
    action_type: row.action_type,
    segment: row.segment,
    old_policy: oldPolicy,
    new_policy: newPolicy,
    change_type: row.change_type,
    changed_by: row.changed_by,
    change_reason: row.change_reason,
    created_at: createdAt,
  };
}

export async function insertActionAutonomyPolicyAudit(
  client: PoolClient,
  input: ActionAutonomyPolicyAuditInput
): Promise<string> {
  const result = await client.query<{ id: string | number }>(
    `INSERT INTO action_autonomy_policy_audit
      (
        action_type,
        segment,
        old_policy,
        new_policy,
        change_type,
        changed_by,
        change_reason
      )
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
     RETURNING id`,
    [
      input.action_type,
      input.segment,
      input.old_policy === null ? null : JSON.stringify(input.old_policy),
      JSON.stringify(input.new_policy),
      input.change_type,
      input.changed_by,
      input.change_reason,
    ]
  );

  const id = result.rows[0]?.id;

  if (id === undefined) {
    throw new Error("Policy audit insert did not return an id.");
  }

  return String(id);
}

export async function listActionAutonomyPolicyAudits(
  client: PoolClient,
  options: ListActionAutonomyPolicyAuditsOptions = {}
): Promise<ActionAutonomyPolicyAuditRecord[]> {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (options.actionType) {
    values.push(options.actionType);
    clauses.push(`action_type = $${values.length}`);
  }

  if (options.segment !== undefined) {
    if (options.segment === null) {
      clauses.push("segment IS NULL");
    } else {
      values.push(options.segment);
      clauses.push(`segment = $${values.length}`);
    }
  }

  if (options.changeType) {
    values.push(options.changeType);
    clauses.push(`change_type = $${values.length}`);
  }

  const limit = Math.max(1, Math.min(200, Math.trunc(options.limit ?? 50)));
  values.push(limit);

  const result = await client.query<ActionAutonomyPolicyAuditRow>(
    `SELECT
      id,
      action_type,
      segment,
      old_policy,
      new_policy,
      change_type,
      changed_by,
      change_reason,
      created_at
     FROM action_autonomy_policy_audit
     ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
     ORDER BY created_at DESC, id DESC
     LIMIT $${values.length}`,
    values
  );

  return result.rows.flatMap((row) => {
    const audit = normalizeAuditRow(row);
    return audit ? [audit] : [];
  });
}
