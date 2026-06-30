import type { PoolClient } from "pg";
import { AppShell } from "../../../components/AppShell";
import { Panel } from "../../../components/Panel";
import { PolicyEditorTable } from "../../../components/PolicyEditorTable";
import {
  StatusPill,
  type StatusPillVariant,
} from "../../../components/StatusPill";
import {
  listActionAutonomyPolicies,
} from "../../../lib/agent/autonomy-policy.repository";
import {
  listActionAutonomyPolicyAudits,
  type ActionAutonomyPolicyAuditRecord,
  type ActionAutonomyPolicyChangeType,
} from "../../../lib/agent/autonomy-policy-audit.repository";
import type {
  ActionAutonomyPolicy,
  AutonomyTier,
} from "../../../lib/agent/autonomy-policy";
import { pool } from "../../../lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const tierExplanations: {
  description: string;
  tier: AutonomyTier;
}[] = [
  {
    tier: "shadow",
    description:
      "Does not execute. Records a counterfactual suggestion for evaluation.",
  },
  {
    tier: "supervised",
    description: "Does not execute. Queues the proposed action for human review.",
  },
  {
    tier: "bounded",
    description:
      "Executes only when confidence, blast radius, reversibility, and breaker guards pass.",
  },
  {
    tier: "autonomous",
    description:
      "Executes within guards. Guard failures become human-review suggestions.",
  },
];

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSegment(segment: string | null) {
  return segment === null ? "Default" : formatLabel(segment);
}

function formatDate(value: Date) {
  return value.toLocaleString();
}

function tierVariant(tier: AutonomyTier): StatusPillVariant {
  if (tier === "shadow") return "muted";
  if (tier === "supervised") return "warning";
  if (tier === "bounded") return "info";
  return "success";
}

function changeTypeVariant(
  changeType: ActionAutonomyPolicyChangeType
): StatusPillVariant {
  if (changeType === "deleted") return "danger";
  if (changeType === "updated") return "warning";
  if (changeType === "created") return "info";
  return "muted";
}

type PolicyAdminData = {
  policies: ActionAutonomyPolicy[];
  audits: ActionAutonomyPolicyAuditRecord[];
  policyError: string | null;
  auditError: string | null;
};

async function loadPolicyAdminData(): Promise<PolicyAdminData> {
  let client: PoolClient | null = null;

  try {
    client = await pool.connect();

    const [policiesResult, auditsResult] = await Promise.allSettled([
      listActionAutonomyPolicies(client),
      listActionAutonomyPolicyAudits(client),
    ]);

    if (policiesResult.status === "rejected") {
      console.error(
        "Unable to load autonomy policies:",
        policiesResult.reason instanceof Error
          ? policiesResult.reason.message
          : "Unknown database error"
      );
    }

    if (auditsResult.status === "rejected") {
      console.error(
        "Unable to load autonomy policy audit:",
        auditsResult.reason instanceof Error
          ? auditsResult.reason.message
          : "Unknown database error"
      );
    }

    return {
      policies:
        policiesResult.status === "fulfilled" ? policiesResult.value : [],
      audits: auditsResult.status === "fulfilled" ? auditsResult.value : [],
      policyError:
        policiesResult.status === "rejected"
          ? "Autonomy policies could not be loaded. Check the local database connection and try again."
          : null,
      auditError:
        auditsResult.status === "rejected"
          ? "Policy change history could not be loaded. Apply the audit migration and try again."
          : null,
    };
  } catch (error) {
    console.error(
      "Unable to load policy admin data:",
      error instanceof Error ? error.message : "Unknown database error"
    );

    return {
      policies: [],
      audits: [],
      policyError:
        "Autonomy policies could not be loaded. Check the local database connection and try again.",
      auditError:
        "Policy change history could not be loaded. Check the local database connection and try again.",
    };
  } finally {
    client?.release();
  }
}

export default async function AutonomyPoliciesPage() {
  const { policies, audits, policyError, auditError } =
    await loadPolicyAdminData();

  return (
    <AppShell active="policies">
      <div className="grid min-w-0 gap-6">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-subtle)]">
            Policy admin
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)] sm:text-4xl">
            Autonomy Policies
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)] sm:text-base">
            Inspect the rules that determine whether Linea may execute, suggest,
            or shadow each proposed action. Existing rows can be changed only
            through guarded, audited updates.
          </p>
        </header>

        <Panel eyebrow="Control plane" title="How autonomy tiers behave">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {tierExplanations.map(({ description, tier }) => (
              <article
                key={tier}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4"
              >
                <StatusPill variant={tierVariant(tier)}>
                  {formatLabel(tier)}
                </StatusPill>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  {description}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-subtle)]">
              Execution invariant
            </p>
            <p className="mt-2 font-mono text-sm leading-6 text-[var(--text-primary)]">
              model proposes → policy decides → executor acts → audit records
              facts
            </p>
          </div>
        </Panel>

        <Panel
          eyebrow="Effective configuration"
          title="Policy rows"
          className="min-w-0"
          action={
            policies.length > 0 ? (
              <StatusPill variant="default">
                {policies.length} policies
              </StatusPill>
            ) : undefined
          }
        >
          {policyError ? (
            <div
              role="alert"
              className="rounded-lg border border-[var(--status-red-border)] bg-[var(--status-red-bg)] p-5"
            >
              <p className="font-medium text-[var(--status-red-text)]">
                Policy data unavailable
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {policyError}
              </p>
            </div>
          ) : policies.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-2)] p-5">
              <p className="font-medium text-[var(--text-primary)]">
                No autonomy policies found
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                The restrictive supervised fallback remains the safe default
                when no policy row exists.
              </p>
            </div>
          ) : (
            <PolicyEditorTable
              policies={policies.map((policy) => ({
                ...policy,
                updated_at: policy.updated_at.toISOString(),
              }))}
            />
          )}
        </Panel>

        <Panel
          eyebrow="Change history"
          title="Policy Change Audit"
          action={
            audits.length > 0 ? (
              <StatusPill variant="default">
                Latest {audits.length}
              </StatusPill>
            ) : undefined
          }
        >
          {auditError ? (
            <div
              role="alert"
              className="rounded-lg border border-[var(--status-red-border)] bg-[var(--status-red-bg)] p-5"
            >
              <p className="font-medium text-[var(--status-red-text)]">
                Policy audit unavailable
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {auditError}
              </p>
            </div>
          ) : audits.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-2)] p-5">
              <p className="font-medium text-[var(--text-primary)]">
                No policy changes have been recorded yet.
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                Seeded defaults are marked with updated_by = seed.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-lg border border-[var(--border-subtle)]">
              {audits.map((audit) => (
                <article
                  key={audit.id}
                  className="grid gap-3 bg-[var(--surface-2)] p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-xs font-medium text-[var(--text-primary)]">
                        {audit.action_type}
                      </p>
                      <StatusPill
                        variant={changeTypeVariant(audit.change_type)}
                      >
                        {formatLabel(audit.change_type)}
                      </StatusPill>
                      <StatusPill variant="default">
                        {formatSegment(audit.segment)}
                      </StatusPill>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      Changed by {audit.changed_by}
                    </p>
                    {audit.change_reason ? (
                      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                        {audit.change_reason}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-[var(--text-subtle)]">
                        No change reason recorded.
                      </p>
                    )}
                  </div>
                  <time
                    dateTime={audit.created_at.toISOString()}
                    className="text-xs text-[var(--text-subtle)] md:text-right"
                  >
                    {formatDate(audit.created_at)}
                  </time>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
