import type { PoolClient } from "pg";
import { redirect } from "next/navigation";
import { AppShell } from "../../../components/AppShell";
import { OperatorIdentity } from "../../../components/OperatorIdentity";
import { Panel } from "../../../components/Panel";
import { PolicyEditorTable } from "../../../components/PolicyEditorTable";
import {
  PolicyChangeRequestsPanel,
} from "../../../components/PolicyChangeRequestsPanel";
import {
  StatusPill,
  type StatusPillVariant,
} from "../../../components/StatusPill";
import {
  listActionAutonomyPolicies,
} from "../../../lib/agent/autonomy-policy.repository";
import {
  listActiveCircuitBreakers,
  type AgentCircuitBreakerRecord,
} from "../../../lib/agent/circuit-breaker";
import {
  listActionAutonomyPolicyAudits,
  type ActionAutonomyPolicyAuditRecord,
  type ActionAutonomyPolicyChangeType,
} from "../../../lib/agent/autonomy-policy-audit.repository";
import {
  listActionAutonomyPolicyChangeRequests,
  type ActionAutonomyPolicyChangeRequestRecord,
} from "../../../lib/agent/autonomy-policy-change-request.repository";
import { classifyPolicyChangeRisk } from "../../../lib/agent/autonomy-policy-validation";
import type {
  ActionAutonomyPolicy,
  AutonomyTier,
} from "../../../lib/agent/autonomy-policy";
import { pool } from "../../../lib/db";
import { getCurrentOperator } from "../../../lib/auth/current-operator";
import { getAutonomyTermDefinition } from "../../../lib/ui/autonomy";
import { formatOperatorDateTime } from "../../../lib/ui/datetime";
import { formatDisplayLabel } from "../../../lib/ui/labels";

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

function formatSegment(segment: string | null) {
  return segment === null ? "Default" : formatDisplayLabel(segment);
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
  if (changeType === "requested") return "warning";
  if (changeType === "approved") return "success";
  if (changeType === "rejected") return "danger";
  if (changeType === "created") return "info";
  return "muted";
}

type PolicyAdminData = {
  policies: ActionAutonomyPolicy[];
  audits: ActionAutonomyPolicyAuditRecord[];
  requests: ActionAutonomyPolicyChangeRequestRecord[];
  circuitBreakers: AgentCircuitBreakerRecord[];
  policyError: string | null;
  auditError: string | null;
  requestError: string | null;
  circuitBreakerError: string | null;
};

async function settle<T>(
  operation: () => Promise<T>
): Promise<PromiseSettledResult<T>> {
  try {
    return { status: "fulfilled", value: await operation() };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}

async function loadPolicyAdminData(): Promise<PolicyAdminData> {
  let client: PoolClient | null = null;

  try {
    const connectedClient = await pool.connect();
    client = connectedClient;

    // A pg PoolClient executes one query at a time. Keep these reads
    // sequential while preserving independent error states for each panel.
    const policiesResult = await settle(() =>
      listActionAutonomyPolicies(connectedClient)
    );
    const auditsResult = await settle(() =>
      listActionAutonomyPolicyAudits(connectedClient)
    );
    const requestsResult = await settle(() =>
      listActionAutonomyPolicyChangeRequests(connectedClient, {
        status: "pending",
      })
    );
    const circuitBreakersResult = await settle(() =>
      listActiveCircuitBreakers(connectedClient)
    );

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

    if (requestsResult.status === "rejected") {
      console.error(
        "Unable to load autonomy policy change requests:",
        requestsResult.reason instanceof Error
          ? requestsResult.reason.message
          : "Unknown database error"
      );
    }

    if (circuitBreakersResult.status === "rejected") {
      console.error(
        "Unable to load agent circuit breakers:",
        circuitBreakersResult.reason instanceof Error
          ? circuitBreakersResult.reason.message
          : "Unknown database error"
      );
    }

    return {
      policies:
        policiesResult.status === "fulfilled" ? policiesResult.value : [],
      audits: auditsResult.status === "fulfilled" ? auditsResult.value : [],
      requests:
        requestsResult.status === "fulfilled" ? requestsResult.value : [],
      circuitBreakers:
        circuitBreakersResult.status === "fulfilled"
          ? circuitBreakersResult.value
          : [],
      policyError:
        policiesResult.status === "rejected"
          ? "Autonomy policies could not be loaded. Check the local database connection and try again."
          : null,
      auditError:
        auditsResult.status === "rejected"
          ? "Policy change history could not be loaded. Apply the audit migration and try again."
          : null,
      requestError:
        requestsResult.status === "rejected"
          ? "Pending policy changes could not be loaded. Apply the change-request migration and try again."
          : null,
      circuitBreakerError:
        circuitBreakersResult.status === "rejected"
          ? "Circuit breakers could not be loaded. Apply the circuit-breaker migration and try again."
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
      requests: [],
      circuitBreakers: [],
      policyError:
        "Autonomy policies could not be loaded. Check the local database connection and try again.",
      auditError:
        "Policy change history could not be loaded. Check the local database connection and try again.",
      requestError:
        "Pending policy changes could not be loaded. Check the local database connection and try again.",
      circuitBreakerError:
        "Circuit breakers could not be loaded. Check the local database connection and try again.",
    };
  } finally {
    client?.release();
  }
}

export default async function AutonomyPoliciesPage() {
  const operator = await getCurrentOperator();
  if (!operator) redirect("/login?returnTo=/admin/policies");

  const {
    policies,
    audits,
    requests,
    circuitBreakers,
    policyError,
    auditError,
    requestError,
    circuitBreakerError,
  } = await loadPolicyAdminData();

  return (
    <AppShell active="policies">
      <div className="grid min-w-0 gap-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-subtle)]">
              Policy admin
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)] sm:text-4xl">
              Autonomy Policies
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)] sm:text-base">
              Inspect the rules that determine whether Linea may execute,
              suggest, or shadow each proposed action. Existing rows can be
              changed only through guarded, audited updates.
            </p>
          </div>
          <OperatorIdentity username={operator.username} />
        </header>

        <Panel eyebrow="Control plane" title="How autonomy tiers behave">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {tierExplanations.map(({ description, tier }) => (
              <article
                key={tier}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4"
              >
                <StatusPill
                  title={getAutonomyTermDefinition(tier)}
                  variant={tierVariant(tier)}
                >
                  {formatDisplayLabel(tier)}
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
          eyebrow="Runtime safety"
          title="Circuit Breakers"
          action={
            circuitBreakers.length > 0 ? (
              <StatusPill variant="danger">
                {circuitBreakers.length} active
              </StatusPill>
            ) : undefined
          }
        >
          {circuitBreakerError ? (
            <div
              role="alert"
              className="rounded-lg border border-[var(--status-red-border)] bg-[var(--status-red-bg)] p-5"
            >
              <p className="font-medium text-[var(--status-red-text)]">
                Circuit breaker status unavailable
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {circuitBreakerError}
              </p>
            </div>
          ) : circuitBreakers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-2)] p-5">
              <p className="font-medium text-[var(--text-primary)]">
                No active circuit breakers.
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                Directive planning will still evaluate recent failures and
                policy-rejection spikes.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {circuitBreakers.map((breaker) => (
                <article
                  key={breaker.id}
                  className="grid gap-4 rounded-lg border border-[var(--status-red-border)] bg-[var(--status-red-bg)] p-4 lg:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-medium text-[var(--text-primary)]">
                        {breaker.breaker_key}
                      </p>
                      <StatusPill variant="danger">Active</StatusPill>
                      <StatusPill variant="default">
                        {formatDisplayLabel(breaker.scope)}
                      </StatusPill>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                      {breaker.reason}
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-subtle)]">
                      Triggered by {breaker.triggered_by}
                    </p>
                    {Object.keys(breaker.metadata).length > 0 ? (
                      <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3 text-xs leading-5 text-[var(--text-muted)]">
                        {JSON.stringify(breaker.metadata, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                  <time
                    dateTime={breaker.triggered_at.toISOString()}
                    className="text-xs text-[var(--text-subtle)] lg:text-right"
                  >
                    {formatOperatorDateTime(breaker.triggered_at)}
                  </time>
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          eyebrow="Approval queue"
          title="Pending Policy Change Requests"
          action={
            requests.length > 0 ? (
              <StatusPill variant="warning">
                {requests.length} pending
              </StatusPill>
            ) : undefined
          }
        >
          {requestError ? (
            <div
              role="alert"
              className="rounded-lg border border-[var(--status-red-border)] bg-[var(--status-red-bg)] p-5"
            >
              <p className="font-medium text-[var(--status-red-text)]">
                Approval queue unavailable
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {requestError}
              </p>
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-2)] p-5">
              <p className="font-medium text-[var(--text-primary)]">
                No policy changes are waiting for approval.
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                Risky edits appear here without affecting effective policy.
              </p>
            </div>
          ) : (
            <PolicyChangeRequestsPanel
              operatorUsername={operator.username}
              requests={requests.map((request) => ({
                id: request.id,
                action_type: request.action_type,
                segment: request.segment,
                old_policy: request.old_policy,
                proposed_policy: request.proposed_policy,
                requested_by: request.requested_by,
                request_reason: request.request_reason,
                created_at: request.created_at.toISOString(),
                risk_reasons: classifyPolicyChangeRisk({
                  existingPolicy: request.old_policy,
                  normalizedPatch: request.patch,
                }).reasons,
              }))}
            />
          )}
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
              operatorUsername={operator.username}
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
                        {formatDisplayLabel(audit.change_type)}
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
                    {formatOperatorDateTime(audit.created_at)}
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
