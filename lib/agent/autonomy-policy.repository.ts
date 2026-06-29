import type { PoolClient } from "pg";
// @ts-expect-error Node's direct TypeScript test runner requires the extension.
import { getRestrictiveDefaultPolicy } from "./autonomy-policy.ts";
import type {
  ActionAutonomyPolicy,
  AutonomyTier,
} from "./autonomy-policy";

type ActionAutonomyPolicyRow = {
  action_type: string;
  segment: string | null;
  tier: string;
  confidence_floor: string | number;
  max_blast_radius: number;
  requires_reversible: boolean;
  updated_by: string | null;
  updated_at: Date | string;
};

const autonomyTiers: AutonomyTier[] = [
  "shadow",
  "supervised",
  "bounded",
  "autonomous",
];

function isAutonomyTier(value: string): value is AutonomyTier {
  return autonomyTiers.includes(value as AutonomyTier);
}

function normalizePolicyRow(
  row: ActionAutonomyPolicyRow
): ActionAutonomyPolicy | null {
  const confidenceFloor = Number(row.confidence_floor);
  const maxBlastRadius = Number(row.max_blast_radius);
  const updatedAt =
    row.updated_at instanceof Date
      ? new Date(row.updated_at)
      : new Date(row.updated_at);

  if (
    !isAutonomyTier(row.tier) ||
    !Number.isFinite(confidenceFloor) ||
    !Number.isFinite(maxBlastRadius) ||
    Number.isNaN(updatedAt.getTime())
  ) {
    return null;
  }

  return {
    action_type: row.action_type,
    segment: row.segment,
    tier: row.tier,
    confidence_floor: confidenceFloor,
    max_blast_radius: maxBlastRadius,
    requires_reversible: row.requires_reversible,
    updated_by: row.updated_by,
    updated_at: updatedAt,
  };
}

export async function findActionAutonomyPolicy(
  client: PoolClient,
  actionType: string,
  segment?: string | null
): Promise<ActionAutonomyPolicy | null> {
  const normalizedSegment = segment ?? null;
  const result =
    normalizedSegment === null
      ? await client.query<ActionAutonomyPolicyRow>(
          `SELECT
            action_type,
            segment,
            tier,
            confidence_floor,
            max_blast_radius,
            requires_reversible,
            updated_by,
            updated_at
           FROM action_autonomy_policy
           WHERE action_type = $1
             AND segment IS NULL
           LIMIT 1`,
          [actionType]
        )
      : await client.query<ActionAutonomyPolicyRow>(
          `SELECT
            action_type,
            segment,
            tier,
            confidence_floor,
            max_blast_radius,
            requires_reversible,
            updated_by,
            updated_at
           FROM action_autonomy_policy
           WHERE action_type = $1
             AND segment = $2
           LIMIT 1`,
          [actionType, normalizedSegment]
        );

  const row = result.rows[0];
  return row ? normalizePolicyRow(row) : null;
}

export async function resolveActionAutonomyPolicy(
  client: PoolClient,
  actionType: string,
  segment?: string | null
): Promise<ActionAutonomyPolicy> {
  const normalizedSegment = segment ?? null;

  if (normalizedSegment !== null) {
    const segmentPolicy = await findActionAutonomyPolicy(
      client,
      actionType,
      normalizedSegment
    );

    if (segmentPolicy) return segmentPolicy;
  }

  const defaultPolicy = await findActionAutonomyPolicy(
    client,
    actionType,
    null
  );

  return (
    defaultPolicy ??
    getRestrictiveDefaultPolicy(actionType, normalizedSegment)
  );
}

export async function resolveActionAutonomyPolicies(
  client: PoolClient,
  actionTypes: string[],
  segment?: string | null
): Promise<Map<string, ActionAutonomyPolicy>> {
  const policies = new Map<string, ActionAutonomyPolicy>();

  for (const actionType of actionTypes) {
    if (policies.has(actionType)) continue;

    policies.set(
      actionType,
      await resolveActionAutonomyPolicy(client, actionType, segment)
    );
  }

  return policies;
}

export async function listActionAutonomyPolicies(
  client: PoolClient
): Promise<ActionAutonomyPolicy[]> {
  const result = await client.query<ActionAutonomyPolicyRow>(
    `SELECT
      action_type,
      segment,
      tier,
      confidence_floor,
      max_blast_radius,
      requires_reversible,
      updated_by,
      updated_at
     FROM action_autonomy_policy
     ORDER BY
       action_type ASC,
       segment ASC NULLS FIRST,
       updated_at DESC`
  );

  return result.rows.flatMap((row) => {
    const policy = normalizePolicyRow(row);
    return policy ? [policy] : [];
  });
}
