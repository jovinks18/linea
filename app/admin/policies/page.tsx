import type { PoolClient } from "pg";
import { AppShell } from "../../../components/AppShell";
import { Panel } from "../../../components/Panel";
import {
  StatusPill,
  type StatusPillVariant,
} from "../../../components/StatusPill";
import {
  listActionAutonomyPolicies,
} from "../../../lib/agent/autonomy-policy.repository";
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

async function loadPolicies(): Promise<
  | { policies: ActionAutonomyPolicy[]; error: null }
  | { policies: []; error: string }
> {
  let client: PoolClient | null = null;

  try {
    client = await pool.connect();
    return {
      policies: await listActionAutonomyPolicies(client),
      error: null,
    };
  } catch (error) {
    console.error(
      "Unable to load autonomy policies:",
      error instanceof Error ? error.message : "Unknown database error"
    );

    return {
      policies: [],
      error:
        "Autonomy policies could not be loaded. Check the local database connection and try again.",
    };
  } finally {
    client?.release();
  }
}

export default async function AutonomyPoliciesPage() {
  const { policies, error } = await loadPolicies();

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
            or shadow each proposed action. This surface is read-only.
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
          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-[var(--status-red-border)] bg-[var(--status-red-bg)] p-5"
            >
              <p className="font-medium text-[var(--status-red-text)]">
                Policy data unavailable
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {error}
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
            <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
              <table className="min-w-[980px] w-full border-collapse text-left">
                <thead className="bg-[var(--surface-3)]">
                  <tr className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-subtle)]">
                    <th scope="col" className="px-4 py-3">
                      Action
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Segment
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Tier
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Confidence floor
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Max blast radius
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Requires reversible
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Updated by
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Updated at
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {policies.map((policy) => (
                    <tr
                      key={`${policy.action_type}:${policy.segment ?? "default"}:${policy.updated_at.toISOString()}`}
                      className="bg-[var(--surface-2)] text-sm text-[var(--text-secondary)]"
                    >
                      <th
                        scope="row"
                        className="px-4 py-4 font-mono text-xs font-medium text-[var(--text-primary)]"
                      >
                        {policy.action_type}
                      </th>
                      <td className="px-4 py-4">
                        {formatSegment(policy.segment)}
                      </td>
                      <td className="px-4 py-4">
                        <StatusPill variant={tierVariant(policy.tier)}>
                          {formatLabel(policy.tier)}
                        </StatusPill>
                      </td>
                      <td className="px-4 py-4">
                        {Math.round(policy.confidence_floor * 100)}%
                      </td>
                      <td className="px-4 py-4">
                        {policy.max_blast_radius}
                      </td>
                      <td className="px-4 py-4">
                        {policy.requires_reversible ? "Yes" : "No"}
                      </td>
                      <td className="px-4 py-4">
                        {policy.updated_by ?? "Not recorded"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-xs text-[var(--text-muted)]">
                        <time dateTime={policy.updated_at.toISOString()}>
                          {formatDate(policy.updated_at)}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
